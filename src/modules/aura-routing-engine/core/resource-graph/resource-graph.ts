import { type DataGraph, type DataGraphLoadResult, type DataSnapshot } from '../data-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import type { PipelineStepResult } from '../navigation/types';
import { getActiveChain } from '../route-tree/matched-chain';
import type { ViewGraph, ViewPayload } from '../view-graph';
import { HandoffCache } from './handoff-cache';
import type { HandoffWaiter } from './handoff-work-registry';

export type ResourceGraphRunContext = {
  /** Full active branch (root → leaf), including LCA parents outside enterRoutes. */
  branch: readonly MatchedRouteInfo[];
  transaction: NavigationTransaction;
};

export type ResourceGraphLoadPlan = {
  /** Enter routes with `load` — run via DataGraph (parallel; `ctx.parent()` opt-in join). */
  dataRoutes: readonly MatchedRouteInfo[];
  /**
   * Enter routes whose view/content can start without waiting for load payloads.
   * Runs in parallel with {@link dataRoutes}.
   */
  viewRoutes: readonly MatchedRouteInfo[];
  viewWithDataRoutes: readonly MatchedRouteInfo[];
};

/**
 * Result of {@link ResourceGraph.resolve}.
 *
 * Navigation: `{ data?, view }` or `{ error }`.
 * Prefetch: soft `{}` (warmup only).
 */
export type ResourceGraphResolveResult = {
  /** Terminal prepare outcome (cancel / fail / redirect). */
  error?: PipelineStepResult;
  /** DataGraph snapshot for the enter branch. */
  data?: DataSnapshot;
  /** View payloads in `enterRoutes` order. No content → `null`. */
  view?: readonly (ViewPayload | null)[];
};

/**
 * One supersede hold from {@link ResourceGraph.holdSharedBufferFor}.
 * Unhold only this lease — concurrent A→B→C holds stay independent.
 */
export type SharedBufferHold = {
  /** Idempotent. Drops handoff holds taken for this lease only. */
  unhold(): void;
};

/**
 * Owner of prepare: data + view plan, handoff interest across supersede.
 *
 * Coordinator: `hold = holdSharedBufferFor(B)` → cancel(A) → run(B) → `hold.unhold()`.
 * Does not touch {@link HandoffCache} directly.
 *
 * {@link resolve} is not wired into {@link NavigationTransactionPipeline} yet.
 */
export class ResourceGraph {
  readonly viewGraph: ViewGraph;
  readonly dataGraph: DataGraph;
  private readonly sharedBuffer: HandoffCache;

  private branch!: readonly MatchedRouteInfo[];
  private enterRoutes!: readonly MatchedRouteInfo[];
  private transaction!: NavigationTransaction;

  constructor(viewGraph: ViewGraph, dataGraph: DataGraph, sharedBuffer: HandoffCache) {
    this.viewGraph = viewGraph;
    this.dataGraph = dataGraph;
    this.sharedBuffer = sharedBuffer;
  }

  private get isNavigationMode(): boolean {
    return this.transaction.phaseMode === 'navigation';
  }

  /**
   * Hold handoff generations for `to`’s data + view keys (active chain).
   * Call on B **before** cancelling A. Returns a handle — only that handle’s `unhold` drops these holds.
   *
   * Pins base {@link MatchedRouteInfo.viewKey} (not `viewKeyWithData`) — enough to keep
   * in-flight independent content / layout alive across supersede. Data-bound keys with
   * a data suffix are held by {@link ViewGraph} waiters once load starts with payload.
   */
  holdSharedBufferFor(to: MatchedRouteInfo): SharedBufferHold {
    const waiters: HandoffWaiter[] = [];
    const seen = new Set<string>();

    for (const match of getActiveChain(to)) {
      for (const key of [match.dataKey, match.viewKey]) {
        if (!key || seen.has(key)) continue;
        seen.add(key);
        waiters.push(this.sharedBuffer.hold(key, 'navigation'));
      }
    }

    let released = false;

    return {
      unhold: () => {
        if (released) return;
        released = true;
        for (const waiter of waiters) {
          waiter.release();
        }
      },
    };
  }

  resolve(enterRoutes: readonly MatchedRouteInfo[], context: ResourceGraphRunContext): Promise<ResourceGraphResolveResult> {
    this.branch = context.branch;
    this.transaction = context.transaction;
    this.enterRoutes = enterRoutes;
    const plan = this.buildLoadPlan();
    return this.isNavigationMode ? this.load(plan) : this.prefetch(plan);
  }

  /**
   * Splits enter routes into data vs independent content buckets.
   */
  buildLoadPlan(enterRoutes: readonly MatchedRouteInfo[] = this.enterRoutes): ResourceGraphLoadPlan {
    const dataRoutes: MatchedRouteInfo[] = [];
    const viewRoutes: MatchedRouteInfo[] = [];
    const viewWithDataRoutes: MatchedRouteInfo[] = [];

    for (const matched of enterRoutes) {
      const { route } = matched;
      route.hasLoad && dataRoutes.push(matched);

      // Match ViewGraph.buildViewDescriptor: layout wins over view; template never needsData.
      const layout =
        typeof route.layout === 'string' ? route.layout.trim() : '';
      if (layout) {
        viewRoutes.push(matched);
      } else if (route.view?.loader) {
        route.viewLoaderNeedsData
          ? viewWithDataRoutes.push(matched)
          : viewRoutes.push(matched);
      }
    }

    return { dataRoutes, viewRoutes, viewWithDataRoutes };
  }

  private async load(plan: ResourceGraphLoadPlan): Promise<ResourceGraphResolveResult> {
    const { dataRoutes, viewRoutes, viewWithDataRoutes } = plan;
    const { transaction, enterRoutes } = this;
    const { signal } = transaction;

    const dataPromise: Promise<DataGraphLoadResult> = dataRoutes.length
      ? this.dataGraph.load(dataRoutes, { branch: this.branch, transaction, mode: 'navigation' })
      : Promise.resolve({});

    const contentPromise = this.viewGraph.load(viewRoutes, signal, {
      mode: 'navigation',
      transaction,
    });

    const [dataResult, viewResult] = await Promise.all([dataPromise, contentPromise]);

    if (dataResult.error) return { error: dataResult.error };
    if (viewResult.error) return { error: viewResult.error };

    const viewWithDataResult = await this.viewGraph.load(viewWithDataRoutes, signal, {
      data: (route: MatchedRouteInfo) => dataResult.data?.get(route.dataKey!),
      mode: 'navigation',
      transaction,
    });

    if (viewWithDataResult.error) return { error: viewWithDataResult.error };

    return {
      ...(dataResult.data && { data: dataResult.data }),
      view: enterRoutes.map((match) => {
        const i = viewRoutes.indexOf(match);
        if (i >= 0) return viewResult.data?.[i]?.data ?? null;
        const j = viewWithDataRoutes.indexOf(match);
        if (j >= 0) return viewWithDataResult.data?.[j]?.data ?? null;
        return null;
      }),
    };
  }

  private async prefetch(plan: ResourceGraphLoadPlan): Promise<ResourceGraphResolveResult> {
    const { dataRoutes, viewRoutes, viewWithDataRoutes } = plan;
    const { transaction } = this;
    const { signal } = transaction;
    let parts: Promise<unknown>[] = [];

    if (dataRoutes.length) {
      parts.push(this.dataGraph.load(dataRoutes, {
        branch: this.branch,
        transaction,
        mode: 'prefetch',
      }));
    }

    if (viewRoutes.length) {
      parts.push(this.viewGraph.load(viewRoutes, signal, { mode: 'prefetch' }));
    }

    if (parts.length) {
      await Promise.all(parts);
    }

    if (viewWithDataRoutes.length) {
      // todo check data
      parts = [];
      parts.push(this.viewGraph.load(viewWithDataRoutes, signal, { mode: 'prefetch' }));
      await Promise.all(parts);
    }

    return {};
  }
}

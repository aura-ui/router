import { type DataGraph, type DataGraphLoadResult, type DataSnapshot } from '../data-graph';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import type { PipelineStepResult } from '../navigation/types';
import { getActiveChain } from '../route-tree/matched-chain';
import type { ViewGraph } from '../view-graph';
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
  contentRoutes: readonly MatchedRouteInfo[];
  dataBoundContentRoutes: readonly MatchedRouteInfo[];
};

export type ResourceGraphResolveResult = {
  error?: PipelineStepResult;
  data?: DataSnapshot;
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
   * Hold handoff generations for `to`’s data keys.
   * Call on B **before** cancelling A. Returns a handle — only that handle’s `unhold` drops these holds.
   */
  holdSharedBufferFor(to: MatchedRouteInfo): SharedBufferHold {
    const waiters: HandoffWaiter[] = [];
    for (const match of getActiveChain(to)) {
      if (match.dataKey) {
        waiters.push(this.sharedBuffer.hold(match.dataKey, 'navigation'));
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
    const contentRoutes: MatchedRouteInfo[] = [];
    const dataBoundContentRoutes: MatchedRouteInfo[] = [];

    for (const matched of enterRoutes) {
      const { route } = matched;
      route.hasLoad && dataRoutes.push(matched);

      // Match ViewGraph.buildViewDescriptor: layout wins over view; template never needsData.
      const layout =
        typeof route.layout === 'string' ? route.layout.trim() : '';
      if (layout) {
        contentRoutes.push(matched);
      } else if (route.view?.loader) {
        route.viewLoaderNeedsData
          ? dataBoundContentRoutes.push(matched)
          : contentRoutes.push(matched);
      }
    }

    return { dataRoutes, contentRoutes, dataBoundContentRoutes };
  }

  private async load(plan: ResourceGraphLoadPlan): Promise<ResourceGraphResolveResult> {
    const { dataRoutes, contentRoutes, dataBoundContentRoutes } = plan;
    const { transaction } = this;
    const { signal } = transaction;

    const dataPromise: Promise<DataGraphLoadResult> = dataRoutes.length
      ? this.dataGraph.load(dataRoutes, { branch: this.branch, transaction, mode: 'navigation' })
      : Promise.resolve({});

    const contentPromise = this.viewGraph.loadViews(contentRoutes, signal, {
      mode: 'navigation',
      transaction,
    });

    const [dataResult, contentResult] = await Promise.all([dataPromise, contentPromise]);

    if (dataResult.error) return dataResult;
    if (contentResult.error) return { error: contentResult.error };

    const dataBoundResult = await this.viewGraph.loadViews(
      dataBoundContentRoutes,
      signal,
      (route) => ({
        data: dataResult.data?.get(route.dataKey!),
        mode: 'navigation',
        transaction,
      }),
    );

    if (dataBoundResult.error) return { error: dataBoundResult.error };

    return dataResult;
  }

  private async prefetch(plan: ResourceGraphLoadPlan): Promise<ResourceGraphResolveResult> {
    const { dataRoutes, contentRoutes, dataBoundContentRoutes } = plan;
    const { transaction } = this;
    const { signal } = transaction;
    let parts: Promise<unknown>[] = [];

    if (dataRoutes.length) {
      parts.push(this.dataGraph.prefetch(dataRoutes, {
        branch: this.branch,
        transaction,
        mode: 'prefetch',
      }));
    }

    if (contentRoutes.length) {
      parts.push(this.viewGraph.prefetchBranch(contentRoutes, signal));
    }

    if (parts.length) {
      await Promise.all(parts);
    }

    if (dataBoundContentRoutes.length) {
      // todo check data
      parts = [];
      parts.push(this.viewGraph.prefetchBranch(dataBoundContentRoutes, signal));
      await Promise.all(parts);
    }

    return {};
  }
}

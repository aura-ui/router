import {
  DataGraph,
  type DataGraphCacheOptions,
  type DataGraphLoadResult,
  type DataSnapshot,
} from '../data-graph';
import type { HookRegistry } from '../hooks/registry';
import type { RouterInvalidateOptions } from '../invalidate-router-cache';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import type { PipelineStepResult } from '../navigation/types';
import { getActiveChain } from '../route-tree/matched-chain';
import {
  ViewGraph,
  type ViewGraphCacheOptions,
  type ViewPayload,
} from '../view-graph';
import type { LoaderRegistry } from '../view-graph/registry';

import { HandoffCache, type HandoffCacheOptions } from './handoff-cache';
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
 * One supersede pin lease from {@link ResourceGraph.pinSharedBufferFor}.
 *
 * Drops only this lease’s `'pin'` waiters — concurrent A→B→C leases stay independent.
 * {@link unpin} never arms sticky `hadNavigation` (pin did not set it). Abort of
 * {@link HandoffWaiter.workSignal} still follows registry policy: if `'navigation'` was
 * already sticky on that key and this release drops `refs` to 0, work aborts — that is
 * prior navigation interest, not the pin kind itself. See {@link HandoffWaiterKind}.
 */
export type SharedBufferHold = {
  /** Idempotent. Releases `'pin'` holds taken for this lease only. */
  unpin(): void;
};

/** Wiring for {@link ResourceGraph} — production creates graphs; tests may inject them. */
export type ResourceGraphOptions = {
  /** Hook registry for a created {@link DataGraph} (ignored when `dataGraph` is passed). */
  readonly hooks: HookRegistry;
  /**
   * Override {@link ViewGraph} (tests).
   * Must share {@link sharedBuffer} with {@link dataGraph} — prefer {@link viewRegistry}
   * for custom loaders so ResourceGraph owns one handoff.
   */
  readonly viewGraph?: ViewGraph;
  /** Loader registry for a created {@link ViewGraph} (ignored when `viewGraph` is passed). */
  readonly viewRegistry?: LoaderRegistry;
  /** Options for the created `cache.view` store (ignored when `viewGraph` is passed). */
  readonly viewCacheOptions?: ViewGraphCacheOptions;
  /** Inject {@link DataGraph} (tests). */
  readonly dataGraph?: DataGraph;
  /** Options for the created `cache.data` store (ignored when `dataGraph` is passed). */
  readonly dataCacheOptions?: DataGraphCacheOptions;
  /** Options for the created handoff buffer (ignored when `sharedBuffer` is passed). */
  readonly sharedBufferOptions?: HandoffCacheOptions;

  /**
   * Inject {@link HandoffCache} (tests).
   * Required when injecting {@link viewGraph} / {@link dataGraph} — same instance in all three.
   */
  readonly sharedBuffer?: HandoffCache;
};

/**
 * Composition root for prepare resources: owns {@link HandoffCache}, {@link DataGraph},
 * and {@link ViewGraph}; orchestrates plan + parallel load + supersede pin.
 *
 * Production: construct with {@link ResourceGraphOptions.hooks} (+ optional cache opts).
 * Tests: inject `viewGraph` / `dataGraph` / `sharedBuffer` (must share one handoff).
 *
 * Prepare entry: {@link load}. Supersede (only if A is still active):
 * `pinSharedBufferFor(B)` → `cancel(A)` → `B.run()` → `unpin` (`'pin'` kind).
 */
export class ResourceGraph {
  readonly viewGraph: ViewGraph;
  readonly dataGraph: DataGraph;
  readonly sharedBuffer: HandoffCache;

  private branch!: readonly MatchedRouteInfo[];
  private enterRoutes!: readonly MatchedRouteInfo[];
  private transaction!: NavigationTransaction;

  constructor(options: ResourceGraphOptions) {
    this.sharedBuffer = options.sharedBuffer ?? new HandoffCache(options.sharedBufferOptions);
    this.dataGraph = options.dataGraph ?? new DataGraph(this.sharedBuffer, {
      hooks: options.hooks,
      cache: options.dataCacheOptions,
    });
    this.viewGraph = options.viewGraph ?? new ViewGraph(this.sharedBuffer, {
      cache: options.viewCacheOptions,
      registry: options.viewRegistry,
    });
  }

  load(enterRoutes: readonly MatchedRouteInfo[], context: ResourceGraphRunContext): Promise<ResourceGraphResolveResult> {
    this.branch = context.branch;
    this.transaction = context.transaction;
    this.enterRoutes = enterRoutes;
    return this.execute(this.buildLoadPlan());
  }

  /**
   * Invalidates load-hook cache entries in {@link DataGraph}.
   * Returns affected entry count; `-1` when a full invalidate matched no cached entries.
   */
  invalidateData(options: RouterInvalidateOptions = {}): number {
    return this.dataGraph.invalidate(options);
  }

  /**
   * Invalidates view-loader payload cache in {@link ViewGraph}.
   * Returns affected entry count; `-1` when a full invalidate matched no cached entries.
   */
  invalidateView(options: RouterInvalidateOptions = {}): number {
    return this.viewGraph.invalidate(options);
  }

  /**
   * Abort shared prepare work, then destroy long-lived data/view caches.
   * Call once from engine teardown.
   */
  destroy(): void {
    this.sharedBuffer.destroy();
    this.dataGraph.destroy();
    this.viewGraph.destroy();
  }

  /**
   * Splits enter routes into data vs independent content buckets.
   */
  private buildLoadPlan(enterRoutes: readonly MatchedRouteInfo[] = this.enterRoutes): ResourceGraphLoadPlan {
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

  private async execute(plan: ResourceGraphLoadPlan): Promise<ResourceGraphResolveResult> {
    const { dataRoutes, viewRoutes, viewWithDataRoutes } = plan;
    const { transaction, enterRoutes } = this;
    const { signal, phaseMode: mode } = transaction;

    const dataPromise: Promise<DataGraphLoadResult> = dataRoutes.length
      ? this.dataGraph.load(dataRoutes, { branch: this.branch, transaction, mode })
      : Promise.resolve({});

    const contentPromise = this.viewGraph.load(viewRoutes, signal, {
      mode,
      transaction,
    });

    const [dataResult, viewResult] = await Promise.all([dataPromise, contentPromise]);

    if (dataResult.error) return { error: dataResult.error };
    if (viewResult.error) return { error: viewResult.error };

    const viewWithDataResult = await this.viewGraph.load(viewWithDataRoutes, signal, {
      data: (route: MatchedRouteInfo) => dataResult.data?.get(route.dataKey!),
      mode,
      transaction,
    });

    if (viewWithDataResult.error) return { error: viewWithDataResult.error };

    if (mode === 'prefetch') return {};

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

  /**
   * Pin handoff work generations for `to`’s data + view keys (active chain) across supersede.
   *
   * **When:** {@link NavigationCoordinator} calls this only if `activeTransaction` is already
   * set (A in flight). No active tx → no pin (idle click / first navigation). Order:
   * `pinSharedBufferFor(B)` → `cancel(A)` → assign B active → `await B.run()` →
   * `hold.unpin()` in `finally`.
   *
   * **Kind `'pin'`** (see {@link HandoffWaiterKind}):
   * - Increments `refs` so `cancel(A)` cannot abort shared work on **overlapping** keys
   *   (e.g. LCA parent) before B’s prepare takes a real `'navigation'` / `'prefetch'` hold.
   * - Does **not** set `hadNavigation`. If B exits before prepare (guard / redirect /
   *   cancel) while superseding, `unpin` must not fake “navigation prepare came and left”
   *   and kill prefetch-idle warmup on B’s keys.
   *
   * **Lifetime:** supersede window only — not handoff TTL (~30s), not until prefetch settles.
   * After `unpin`, registry abort policy is unchanged: a real `'navigation'` hold that
   * later finishes can still abort work.
   *
   * Pins base {@link MatchedRouteInfo.viewKey} (not `viewKeyWithData`) — enough for
   * independent content / layout across supersede. Data-bound view keys with a data
   * suffix are held by {@link ViewGraph} once load starts with payload.
   *
   * @returns Lease — only this handle’s {@link SharedBufferHold.unpin} drops these pin waiters.
   */
  pinSharedBufferFor(to: MatchedRouteInfo): SharedBufferHold {
    const waiters: HandoffWaiter[] = [];
    const seen = new Set<string>();

    for (const match of getActiveChain(to)) {
      for (const key of [match.dataKey, match.viewKey]) {
        if (!key || seen.has(key)) continue;
        seen.add(key);
        waiters.push(this.sharedBuffer.hold(key, 'pin'));
      }
    }

    let released = false;

    return {
      unpin: () => {
        if (released) return;
        released = true;
        for (const waiter of waiters) {
          waiter.release();
        }
      },
    };
  }
}

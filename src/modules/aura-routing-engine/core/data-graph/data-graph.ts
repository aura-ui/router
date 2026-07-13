import type { CacheStoreOptions } from '../../../aura-cache-store/core';
import { AuraResolvableCache } from '../../../aura-cache-store/core/aura-resolvable-cache';
import { DEFAULT_GC_TIME } from '../../../aura-cache-store/core';
import {
  invalidateRouterCache,
  type RouterInvalidateOptions,
} from '../invalidate-router-cache';
import { normalizeHookResult, type HookRegistry } from '../hooks/registry';
import type { HookResultInput } from '../hooks/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { PipelineStepResult } from '../navigation/types';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import { NavigationTransactionPipelinePhase } from '../navigation/navigation-transaction-pipeline-phase';
import type { RouteLifecycleContext } from '../route/types';
import { buildRouteDataKey, routeHasLoadHooks, routeLoadHookNames } from './route-data';

export type DataSnapshot = ReadonlyMap<string, unknown>;

export type DataGraphLoadResult = {
  outcome?: PipelineStepResult;
  /** Preserved load-hook payloads on the active branch; omitted when empty or on terminal outcome. */
  snapshot?: DataSnapshot;
};

export type DataGraphOptions = Pick<CacheStoreOptions<unknown>, 'max' | 'staleTime' | 'gcTime'>;

export type DataGraphLoadOptions = {
  /**
   * Full active branch (root → leaf) for snapshot lookup.
   * Includes LCA parents outside {@link load} enterRoutes (cache hits without re-fetch).
   */
  activeChain?: readonly MatchedRouteInfo[];
  transaction: NavigationTransaction;
};

export type DataGraphPrefetchOptions = {
  signal?: AbortSignal;
  mode: 'intent';
};

type LoadHookMode = 'navigation' | 'prefetch';

type RouteLoadDescriptor = {
  hookNames: readonly string[];
  key: string;
};

type TerminalOutcome = Exclude<PipelineStepResult, null>;

class DataGraphTerminalError extends Error {
  readonly outcome: TerminalOutcome;

  constructor(outcome: TerminalOutcome) {
    super('DataGraph terminal hook outcome');
    this.name = 'DataGraphTerminalError';
    this.outcome = outcome;
  }
}

/**
 * Coordinator for route `load` hooks: parallel branch loads, SWR cache, prefetch intent.
 * View/HTML caching stays in `core/view-graph/`.
 */
export class DataGraph {
  private static defaultOptions: DataGraphOptions = {};

  private readonly cache: AuraResolvableCache<unknown>;
  /** Engine hook registry; prefetch uses this (no navigation runtime). */
  private readonly hooks: HookRegistry;

  static configure(options: DataGraphOptions = {}): void {
    DataGraph.defaultOptions = { ...DataGraph.defaultOptions, ...options };
  }

  constructor(hooks: HookRegistry, options: DataGraphOptions = {}) {
    this.hooks = hooks;
    const merged = { ...DataGraph.defaultOptions, ...options };
    this.cache = new AuraResolvableCache({
      max: merged.max,
      staleTime: merged.staleTime ?? 30_000,
      gcTime: merged.gcTime ?? DEFAULT_GC_TIME,
      gcSweepInterval: false,
    });
  }

  /**
   * Blocking navigation load — after history commit, before render.
   * @param enterRoutes Routes entering this transition (LCA delta); load hooks run only here.
   */
  async load(routes: readonly MatchedRouteInfo[], options: DataGraphLoadOptions): Promise<DataGraphLoadResult> {
    const activeChain = options.activeChain ?? routes;
    const routesWithLoadHooks = routes.filter(routeHasLoadHooks);
    if (routesWithLoadHooks.length) {
      const terminal = await this.runParallelNavigationLoads(routesWithLoadHooks, options.transaction);
      if (terminal) {
        return { outcome: terminal };
      }
    }
    const snapshot = this.snapshot(activeChain);
    return snapshot ? { snapshot } : {};
  }

  /** Intent prefetch — guards skipped; redirect/cancel/errors ignored. */
  async prefetch(
    routes: readonly MatchedRouteInfo[],
    options: DataGraphPrefetchOptions,
  ): Promise<void> {
    const routesWithLoadHooks = routes.filter(routeHasLoadHooks);
    await Promise.all(routesWithLoadHooks.map((route) => this.prefetchRoute(route, options.signal)));
  }

  invalidate(options: RouterInvalidateOptions = {}): number {
    return invalidateRouterCache(this.cache, options, 'stale');
  }

  /**
   * Reads cached load-hook payloads for `cache.data` routes on the active branch.
   * @returns `null` when no preserved entries — keeps truthy checks meaningful downstream.
   */
  snapshot(activeChain: readonly MatchedRouteInfo[]): DataSnapshot | undefined {
    const data = new Map<string, unknown>();
    for (const route of activeChain) {
      if (!routePreservesLoadData(route)) continue;
      const descriptor = this.buildRouteLoadDescriptor(route);
      if (!descriptor) continue;
      const value = this.cache.get(descriptor.key);
      if (value !== undefined) {
        data.set(descriptor.key, value);
      }
    }
    return data.size > 0 ? data : undefined;
  }

  destroy(): void {
    this.cache.destroy();
  }

  /**
   * Parallel sibling abort: on redirect/cancel/error, abort in-flight loads on other enter routes.
   * To allow parallel loads to finish despite a terminal sibling, remove `siblingAbort` wiring
   * and pass only `runtime.isJobActive` into `ensureNavigationLoad`.
   */
  private async runParallelNavigationLoads(
    enterRoutesWithLoadHooks: readonly MatchedRouteInfo[],
    transaction: NavigationTransaction,
  ): Promise<PipelineStepResult> {
    const siblingAbort = new AbortController();
    const loadSignal = AbortSignal.any([transaction.signal, siblingAbort.signal]);
    const outcomes: PipelineStepResult[] = [];

    await Promise.all(
      enterRoutesWithLoadHooks.map(async (route, index) => {
        outcomes[index] = await this.ensureNavigationLoad(route, transaction, loadSignal, siblingAbort);
        if (outcomes[index]) {
          siblingAbort.abort();
        }
      }),
    );

    return outcomes.find((outcome) => outcome) ?? null;
  }

  private async ensureNavigationLoad(
    route: MatchedRouteInfo,
    transaction: NavigationTransaction,
    loadSignal: AbortSignal,
    siblingAbort: AbortController,
  ): Promise<PipelineStepResult> {
    const descriptor = this.buildRouteLoadDescriptor(route);
    if (!descriptor) return null;

    const ctx = NavigationTransactionPipelinePhase.buildPhaseContext('load', route, {
      from: transaction.from,
      action: transaction.action,
      router: transaction.engine.router,
      transactionId: transaction.transactionId,
      transactionSignal: loadSignal,
    });
    const isActive = () => transaction.isActive() && !siblingAbort.signal.aborted;

    try {
      await this.resolveRouteLoad(route, descriptor, () =>
        this.runLoadPhaseHooks(
          transaction.engine.hooksRegistry,
          ctx,
          descriptor.hookNames,
          isActive,
          'navigation',
        ),
      );

      // Immutable pipeline step: onLoad runs on every navigation, including cache hits.
      route.route.onLoad(ctx);
      return null;
    } catch (error) {
      if (error instanceof DataGraphTerminalError) return error.outcome;
      if (!isActive()) return { status: 'cancelled' };
      return transaction.fail(route, error, 'load');
    }
  }

  private async prefetchRoute(route: MatchedRouteInfo, signal?: AbortSignal): Promise<void> {
    const abort = signal ?? new AbortController().signal;
    if (abort.aborted) return;

    const descriptor = this.buildRouteLoadDescriptor(route);
    if (!descriptor) return;

    const ctx = NavigationTransactionPipelinePhase.buildPhaseContext('load', route, {
      from: null,
      action: 'push',
      router: {
        navigate: () => {
        },
      },
      transactionId: 0,
      transactionSignal: abort,
    });

    try {
      await this.resolveRouteLoad(route, descriptor, () =>
        this.runLoadPhaseHooks(this.hooks, ctx, descriptor.hookNames, () => !abort.aborted, 'prefetch'),
      );
    } catch {
      // intent: silent
    }
  }

  private buildRouteLoadDescriptor(route: MatchedRouteInfo): RouteLoadDescriptor | null {
    const hookNames = routeLoadHookNames(route);
    if (!hookNames) return null;
    return { hookNames, key: buildRouteDataKey(route, hookNames) };
  }

  private async resolveRouteLoad(
    route: MatchedRouteInfo,
    descriptor: RouteLoadDescriptor,
    load: () => Promise<unknown>,
  ): Promise<void> {
    if (routePreservesLoadData(route)) {
      await this.cache.resolve(descriptor.key, load);
    } else {
      await load();
    }
  }

  /**
   * Runs load hooks sequentially; caches hook payload (last non-terminal return).
   * Does not invoke `onLoad` — caller runs it after cache resolve.
   */
  private async runLoadPhaseHooks(
    hookRegistry: HookRegistry,
    lifecycleContext: RouteLifecycleContext,
    hookNames: readonly string[],
    isJobActive: () => boolean,
    mode: LoadHookMode,
  ): Promise<unknown> {
    let payload: unknown = null;

    for (const name of hookNames) {
      this.assertJobActive(isJobActive, mode);

      const entry = hookRegistry.get(name);
      if (!entry) {
        console.warn(
          `Unknown hook "${name}" on route ${lifecycleContext.route.path} (phase ${lifecycleContext.phase})`,
        );
        continue;
      }

      const raw = await entry.fn({ ...lifecycleContext, options: entry.options });
      this.assertJobActive(isJobActive, mode);

      const terminal = NavigationTransactionPipelinePhase.resolveLoadHookOutcome(
        normalizeHookResult(raw as HookResultInput),
      );

      this.throwIfTerminal(terminal, mode);

      if (raw !== undefined && raw !== true) {
        payload = raw;
      }
    }

    return payload;
  }

  private assertJobActive(isJobActive: () => boolean, mode: LoadHookMode): void {
    if (isJobActive()) return;

    if (mode === 'prefetch') throw new Error('prefetch aborted');
    throw new DataGraphTerminalError({ status: 'cancelled' });
  }

  private throwIfTerminal(terminal: PipelineStepResult, mode: LoadHookMode): void {
    if (!terminal) return;

    if (mode === 'prefetch') throw new Error('prefetch ignored terminal');
    throw new DataGraphTerminalError(terminal);
  }
}

function routePreservesLoadData(route: MatchedRouteInfo): boolean {
  return route.route.cache?.data ?? false;
}

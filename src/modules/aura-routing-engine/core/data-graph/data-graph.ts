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
import { closestRouteWithLoadHooks, routeHasLoadHooks, routeLoadHookNames } from './route-data';
import { promiseWithResolvers } from '../../../aura-utils/async/promises';

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
  branch?: readonly MatchedRouteInfo[]; // Full active branch (root → leaf)
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

/** In-flight / settled load payload for one enter route within a single `load()` call. */
type RouteLoadHandle = {
  route: MatchedRouteInfo;
  payload: Promise<unknown>;
};

type PayloadDeferred = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
};

type NavigationLoadResult = {
  outcome: PipelineStepResult;
  payload: unknown;
};

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
 *
 * Child hooks may opt into parent data via `ctx.parent()` (promise join); default stays parallel.
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
    const branch = options.branch ?? routes;
    const routesWithLoadHooks = routes.filter(routeHasLoadHooks);
    let snapshot;
    if (routesWithLoadHooks.length) {
      const { error, snapshot: _snapshot } = await this.runParallelNavigationLoads(
        routesWithLoadHooks,
        options.transaction,
        branch,
      );
      if (error) {
        return { outcome: error };
      }
      snapshot = _snapshot;
    }
    return snapshot ? { snapshot } : {};
  }

  /** Intent prefetch — guards skipped; redirect/cancel/errors ignored. */
  async prefetch(
    routes: readonly MatchedRouteInfo[],
    options: DataGraphPrefetchOptions,
  ): Promise<void> {
    const routesWithLoadHooks = routes.filter(routeHasLoadHooks);
    const branch = routes;
    const handles = this.createPayloadHandles(routesWithLoadHooks);

    await Promise.all(
      routesWithLoadHooks.map(async (route) => {
        const deferred = handles.deferreds.get(route.route.uid)!;
        try {
          const payload = await this.prefetchRoute(route, options.signal, () =>
            this.awaitParentPayload(route, handles.handles, branch),
          );
          deferred.resolve(payload);
        } catch {
          deferred.resolve(undefined);
        }
      }),
    );
  }

  invalidate(options: RouterInvalidateOptions = {}): number {
    return invalidateRouterCache(this.cache, options, 'stale');
  }

  /**
   * Reads cached load-hook payloads for `cache.data` routes on the active branch.
   * @returns `null` when no preserved entries — keeps truthy checks meaningful downstream.
   */
  snapshot(branch: readonly MatchedRouteInfo[]): DataSnapshot | undefined {
    const data = new Map<string, unknown>();
    for (const route of branch) {
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

  getData(route: MatchedRouteInfo) {
    const descriptor = this.buildRouteLoadDescriptor(route);
    if (!descriptor) return;
    return this.cache.get(descriptor.key);
  }

  /**
   * Parallel sibling abort: on redirect/cancel/error, abort in-flight loads on other enter routes.
   * To allow parallel loads to finish despite a terminal sibling, remove `siblingAbort` wiring
   * and pass only `runtime.isJobActive` into `ensureNavigationLoad`.
   *
   * `ctx.parent()` joins the nearest ancestor handle (or cache for LCA parents outside enter).
   */
  private async runParallelNavigationLoads(
    enterRoutesWithLoadHooks: readonly MatchedRouteInfo[],
    transaction: NavigationTransaction,
    branch: readonly MatchedRouteInfo[],
  ): Promise<any> {
    const siblingAbort = new AbortController();
    const loadSignal = AbortSignal.any([transaction.signal, siblingAbort.signal]);
    const outcomes: PipelineStepResult[] = [];
    const { handles, deferreds } = this.createPayloadHandles(enterRoutesWithLoadHooks);
    const snapshot = new Map<string, unknown>();

    await Promise.all(
      enterRoutesWithLoadHooks.map(async (route, index) => {

        const deferred = deferreds.get(route.route.uid)!;

        const result = await this.ensureNavigationLoad(
          route,
          transaction,
          loadSignal,
          siblingAbort,
          () => this.awaitParentPayload(route, handles, branch),
        );

        const descriptor = this.buildRouteLoadDescriptor(route);
        descriptor?.key && snapshot.set(descriptor.key, result.payload);

        outcomes[index] = result.outcome;
        deferred.resolve(result.payload);

        if (outcomes[index]) {
          siblingAbort.abort();
        }
      }),
    );

    const error = outcomes.find((outcome) => outcome) ?? null;

    return { error, snapshot };
  }

  private async ensureNavigationLoad(
    route: MatchedRouteInfo,
    transaction: NavigationTransaction,
    loadSignal: AbortSignal,
    siblingAbort: AbortController,
    parent: () => Promise<unknown>,
  ): Promise<NavigationLoadResult> {
    const descriptor = this.buildRouteLoadDescriptor(route);
    if (!descriptor) return { outcome: null, payload: undefined };

    const ctx = NavigationTransactionPipelinePhase.buildPhaseContext('load', route, {
      from: transaction.from,
      action: transaction.action,
      router: transaction.engine.router,
      transactionId: transaction.transactionId,
      transactionSignal: loadSignal,
      parent,
    });
    const isActive = () => transaction.isActive() && !siblingAbort.signal.aborted;

    try {
      const payload = await this.resolveRouteLoad(route, descriptor, () =>
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
      return { outcome: null, payload };
    } catch (error) {
      if (error instanceof DataGraphTerminalError) {
        return { outcome: error.outcome, payload: undefined };
      }
      if (!isActive()) return { outcome: { status: 'cancelled' }, payload: undefined };
      return { outcome: transaction.fail(route, error, 'load'), payload: undefined };
    }
  }

  private async prefetchRoute(
    route: MatchedRouteInfo,
    signal: AbortSignal | undefined,
    parent: () => Promise<unknown>,
  ): Promise<unknown> {
    const abort = signal ?? new AbortController().signal;
    if (abort.aborted) return undefined;

    const descriptor = this.buildRouteLoadDescriptor(route);
    if (!descriptor) return undefined;

    const ctx = NavigationTransactionPipelinePhase.buildPhaseContext('load', route, {
      from: null,
      action: 'push',
      router: {
        navigate: () => {
        },
      },
      transactionId: 0,
      transactionSignal: abort,
      parent,
    });

    try {
      return await this.resolveRouteLoad(route, descriptor, () =>
        this.runLoadPhaseHooks(this.hooks, ctx, descriptor.hookNames, () => !abort.aborted, 'prefetch'),
      );
    } catch {
      // intent: silent
      return undefined;
    }
  }

  buildRouteLoadDescriptor(route: MatchedRouteInfo): RouteLoadDescriptor | null {
    const hookNames = routeLoadHookNames(route);
    if (!hookNames) return null;
    return { hookNames, key: route.dataKey! };
  }

  private async resolveRouteLoad(
    route: MatchedRouteInfo,
    descriptor: RouteLoadDescriptor,
    load: () => Promise<unknown>,
  ): Promise<unknown> {
    if (routePreservesLoadData(route)) {
      return this.cache.resolve(descriptor.key, load);
    }
    return load();
  }

  /**
   * Runs load hooks sequentially; returns last non-terminal payload.
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

  private createPayloadHandles(routes: readonly MatchedRouteInfo[]): {
    handles: Map<number, RouteLoadHandle>;
    deferreds: Map<number, PayloadDeferred>;
  } {
    const handles = new Map<number, RouteLoadHandle>();
    const deferreds = new Map<number, PayloadDeferred>();

    for (const route of routes) {
      const { promise, resolve } = promiseWithResolvers();
      const key = route.route.uid;
      deferreds.set(key, { promise, resolve });
      handles.set(key, { route, payload: promise });
    }

    return { handles, deferreds };
  }

  private async awaitParentPayload(
    child: MatchedRouteInfo,
    handles: ReadonlyMap<number, RouteLoadHandle>,
    branch: readonly MatchedRouteInfo[],
  ): Promise<unknown> {
    const parent = closestRouteWithLoadHooks(child, branch);
    if (!parent) return undefined;

    const inFlight = handles.get(parent.route.uid);
    if (inFlight) return inFlight.payload;

    const descriptor = this.buildRouteLoadDescriptor(parent);
    if (!descriptor) return undefined;
    return this.cache.get(descriptor.key);
  }
}

function routePreservesLoadData(route: MatchedRouteInfo): boolean {
  return route.route.cache?.data ?? false;
}


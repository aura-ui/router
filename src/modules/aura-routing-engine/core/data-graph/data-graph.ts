import type { CacheStoreOptions } from '../../../aura-cache-store/core';
import { AuraResolvableCache } from '../../../aura-cache-store/core/aura-resolvable-cache';
import { DEFAULT_GC_TIME } from '../../../aura-cache-store/core';
import {
  invalidateRouterCache,
  type RouterInvalidateOptions,
} from '../invalidate-router-cache';
import { type HookRegistry } from '../hooks/registry';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { PipelineStepResult } from '../navigation/types';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import { NavigationTransactionPipelinePhase } from '../navigation/navigation-transaction-pipeline-phase';
import type { RouteLifecycleContext } from '../route/types';
import { closestRouteWithLoadHooks, routeLoadHookNames } from './route-data';
import { promiseWithResolvers } from '../../../aura-utils/async/promises';
import { HandoffCache } from '../resource-graph';

export type DataSnapshot = ReadonlyMap<string, unknown>;

type TerminalOutcome = Exclude<PipelineStepResult, null>;

/** Success → `data`, stop → `error`. Public batch uses {@link DataSnapshot}; per-route uses payload. */
type LoadResult<T = unknown> = {
  data?: T;
  error?: TerminalOutcome;
};

export type DataGraphLoadResult = LoadResult<DataSnapshot>;

export type DataGraphOptions = Pick<CacheStoreOptions<unknown>, 'max' | 'staleTime' | 'gcTime'>;

export type LoadHookMode = 'navigation' | 'prefetch';

export type DataGraphLoadOptions = {
  /**
   * Full active branch (root → leaf) for snapshot lookup.
   * Includes LCA parents outside {@link load} enterRoutes (cache hits without re-fetch).
   */
  branch?: readonly MatchedRouteInfo[]; // Full active branch (root → leaf)
  transaction: NavigationTransaction;
  mode: LoadHookMode;
};

/** @deprecated Use {@link DataGraphLoadOptions}. */
export type DataGraphPrefetchOptions = DataGraphLoadOptions;

type RouteLoadDescriptor = {
  hookNames: readonly string[];
  key: string;
};

/** In-flight / settled load payload for one enter route within a single `load()` call. */
type RouteLoadHandle = {
  route: MatchedRouteInfo;
  payload: Promise<unknown>;
};

type PayloadDeferred = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
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
  private readonly sharedBuffer: HandoffCache; // use it to save data between transaction phases

  static configure(options: DataGraphOptions = {}): void {
    DataGraph.defaultOptions = { ...DataGraph.defaultOptions, ...options };
  }

  constructor(hooks: HookRegistry, sharedBuffer: HandoffCache, options: DataGraphOptions = {}) {
    this.hooks = hooks;
    this.sharedBuffer = sharedBuffer;
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
  async load(matches: readonly MatchedRouteInfo[], options: DataGraphLoadOptions): Promise<DataGraphLoadResult> {
    const { transaction, mode } = options;
    const branch = options.branch ?? matches;
    const { error, data } = await this.loadParallelRoutes(matches, branch, transaction, mode);
    if (error) return { error };
    return { data };
  }

  async prefetch(matches: readonly MatchedRouteInfo[], options: DataGraphLoadOptions): Promise<DataGraphLoadResult> {
    const { transaction } = options;
    const branch = options.branch ?? matches;
    return await this.loadParallelRoutes(matches, branch, transaction, 'prefetch');
  }

  /**
   * Parallel sibling abort: on cancel/error, abort in-flight loads on other enter routes.
   * `ctx.parent()` joins the nearest ancestor handle (or cache for LCA parents outside enter).
   */
  private async loadParallelRoutes(
    routes: readonly MatchedRouteInfo[],
    branch: readonly MatchedRouteInfo[],
    transaction: NavigationTransaction,
    mode: LoadHookMode,
  ): Promise<LoadResult<Map<string, unknown>>> {
    const siblingAbort = new AbortController();
    const loadSignal = AbortSignal.any([transaction.signal, siblingAbort.signal]);
    const errors: PipelineStepResult[] = [];
    const { handles, deferreds } = this.createPayloadHandles(routes);
    const result = new Map<string, unknown>();

    await Promise.all(
      routes.map(async (match, index) => {
        if (!match.dataKey) return;

        const deferred = deferreds.get(match.route.uid)!;
        const { error, data } = await this.ensureRouteLoad(
          match,
          transaction,
          loadSignal,
          siblingAbort,
          mode,
          () => this.awaitParentPayload(match, handles, branch),
        );

        if (error) {
          errors[index] = error;
          deferred.reject(error instanceof Error ? error : new DataGraphTerminalError(error));
          siblingAbort.abort();
          return;
        }

        result.set(match.dataKey, data);
        deferred.resolve(data);
      }),
    );

    return { error: errors.find((entry) => entry), data: result };
  }

  private async ensureRouteLoad(
    route: MatchedRouteInfo,
    transaction: NavigationTransaction,
    loadSignal: AbortSignal,
    siblingAbort: AbortController,
    mode: LoadHookMode,
    parent: () => Promise<unknown>,
  ): Promise<LoadResult> {
    const hookNames = routeLoadHookNames(route);
    if (!hookNames) return {};

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
      const data = await this.getRouteData(route, () => this.runHookLoaders(ctx, hookNames, isActive));

      // Immutable pipeline step: onLoad runs on every navigation, including cache hits.
      mode === 'navigation' && route.route.onLoad(ctx);
      return { data };
    } catch (error) {
      if (mode === 'prefetch') {
        return { data: undefined };
      }
      if (error instanceof DataGraphTerminalError) {
        return { error: error.outcome };
      }
      if (!isActive()) return { error: { status: 'cancelled' } };
      return { error: await transaction.fail(route, error, 'load') };
    }
  }

  buildRouteLoadDescriptor(route: MatchedRouteInfo): RouteLoadDescriptor | null {
    const hookNames = routeLoadHookNames(route);
    if (!hookNames) return null;
    return { hookNames, key: route.dataKey! };
  }

  private async getRouteData(
    match: MatchedRouteInfo,
    load: () => Promise<LoadResult>,
  ): Promise<unknown> {
    const { route, dataKey } = match;
    if (!dataKey) return undefined;

    return this.sharedBuffer.resolve(dataKey, async () => {
      const useLongCache = route.hasDataCache;
      if (useLongCache) {
        const cachedValue = this.cache.get(dataKey);
        if (cachedValue !== undefined) return cachedValue;
      }

      const { data, error } = await load();
      if (error) {
        throw new DataGraphTerminalError(error);
      }

      useLongCache && this.cache.set(dataKey, data);
      return data;
    });
  }

  /**
   * Runs load hooks in parallel; returns `{ data }` or `{ error }`.
   * Does not invoke `onLoad` — caller runs it after cache resolve.
   * Thrown loader errors propagate to {@link ensureRouteLoad}.
   */
  private async runHookLoaders(
    context: RouteLifecycleContext,
    hookNames: readonly string[],
    isActive: () => boolean,
  ): Promise<LoadResult> {
    const response = await Promise.all(
      hookNames.map((hookName) => {
        const loader = this.hooks.get(hookName);
        if (!loader) {
          console.warn(
            `Unknown hook "${hookName}" on route ${context.route.path} (phase ${context.phase})`,
          );
          return;
        }
        return loader.fn({ ...context, options: loader.options });
      }),
    );

    if (!isActive()) {
      return { error: { status: 'cancelled' } };
    }

    if (hookNames.length === 1) {
      return { data: response[0] };
    }

    const data: Record<string, unknown> = {};
    for (let i = 0; i < hookNames.length; i++) {
      data[hookNames[i]] = response[i];
    }
    return { data };
  }

  private createPayloadHandles(routes: readonly MatchedRouteInfo[]): {
    handles: Map<number, RouteLoadHandle>; deferreds: Map<number, PayloadDeferred>;
  } {
    const handles = new Map<number, RouteLoadHandle>();
    const deferreds = new Map<number, PayloadDeferred>();

    for (const route of routes) {
      const { promise, resolve, reject } = promiseWithResolvers();
      // Avoid unhandledrejection when no child awaits ctx.parent().
      void promise.catch(() => {});
      const key = route.route.uid;
      deferreds.set(key, { promise, resolve, reject });
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

    const dataKey = parent.dataKey;
    if (!dataKey) return undefined;

    // Handoff first (in-flight or settled); long cache only with cache.data.
    const joined = this.sharedBuffer.join(dataKey);
    if (joined) {
      try {
        return await joined;
      } catch {
        // handoff fail — не блокируем parent() если есть persist
        return this.cache.get(dataKey);
      }
    }
    return this.cache.get(dataKey);
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

  getData(route: MatchedRouteInfo): unknown {
    const key = route.dataKey;
    if (!key) return undefined;
    return this.cache.get(key);
  }

  destroy(): void {
    this.cache.destroy();
  }
}

function routePreservesLoadData(route: MatchedRouteInfo): boolean {
  return route.route.cache?.data ?? false;
}


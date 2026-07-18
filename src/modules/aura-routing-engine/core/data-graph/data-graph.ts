import { AuraResolvableCache } from '../../../aura-cache-store/core/aura-resolvable-cache';
import { DEFAULT_GC_TIME } from '../../../aura-cache-store/core';
import { awaitUntilAbort } from '../../../aura-utils/async/await-until-abort';
import { promiseWithResolvers } from '../../../aura-utils/async/promises';
import { resolveHookNames } from '../hooks/resolve-hook-names';
import { invalidateRouterCache } from '../invalidate-router-cache';
import { NavigationTransactionPipelinePhase } from '../navigation/navigation-transaction-pipeline-phase';
import { HandoffCache } from '../resource-graph';
import { closestRouteWithLoadHooks } from './route-data';
import type { CacheStoreOptions } from '../../../aura-cache-store/core';
import type { HookRegistry } from '../hooks/registry';
import type { RouterInvalidateOptions } from '../invalidate-router-cache';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import type { PipelineStepResult } from '../navigation/types';
import type { HandoffWaiterKind } from '../resource-graph';
import type { RouteLifecycleContext } from '../route/types';

/** Default `cache.data` payload TTL — from AuraResolvableCache. */
const DATA_CACHE_GC_TIME = DEFAULT_GC_TIME;

type TerminalOutcome = Exclude<PipelineStepResult, null>;

/** Options for the long-lived `cache.data` store. */
export type DataGraphCacheOptions = Pick<CacheStoreOptions<unknown>, 'max' | 'staleTime' | 'gcTime'>;

export type DataGraphDeps = {
  /** Required — route `load` hooks live on the engine hook registry. */
  readonly hooks: HookRegistry;
  /** Merged over {@link DataGraph.configure} defaults for the internal payload cache. */
  readonly cache?: DataGraphCacheOptions;
};

export type DataSnapshot = ReadonlyMap<string, unknown>;

/**
 * `{ data }` ok · `{ error }` navigation stop · `{}` soft skip (no hooks / prefetch).
 * Same shape as ViewGraph load results.
 */
export type DataGraphRouteLoadResult<T = unknown> = {
  data?: T;
  error?: TerminalOutcome;
};

/**
 * Batch {@link DataGraph.load}: `{ data }` ok · `{ error }` first failure.
 * On error drops partial sibling results (same as {@link ViewGraph.load}).
 * {@link DataGraph.prefetch} keeps partial `data` and never fails the caller.
 */
export type DataGraphLoadResult = DataGraphRouteLoadResult<DataSnapshot>;

/** Same literals as {@link HandoffWaiterKind} — pass through to {@link HandoffCache.hold}. */
export type LoadHookMode = HandoffWaiterKind;

export type DataGraphLoadOptions = {
  /** Full active branch (root → leaf), including LCA parents outside enterRoutes. */
  readonly branch?: readonly MatchedRouteInfo[];
  readonly transaction: NavigationTransaction;
  readonly mode: LoadHookMode;
};

/** Soft skip — prefetch cancel / no hooks. */
const SKIP_RESULT: DataGraphRouteLoadResult = {};
/** Navigation interest dropped before settle. */
const CANCELLED_RESULT: DataGraphRouteLoadResult = { error: { status: 'cancelled' } };

/** Deferred payload for one enter route — children await via `ctx.parent()`. */
type PayloadDeferred = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

/** Shared inputs for one enter-route inside a parallel batch. */
type EnterRouteLoad = {
  match: MatchedRouteInfo;
  transaction: NavigationTransaction;
  /** Detach this waiter only (`tx` ∪ sibling abort) — not the handoff factory. */
  interestSignal: AbortSignal;
  siblingAbort: AbortController;
  mode: LoadHookMode;
  parent: () => Promise<unknown>;
  deferred: PayloadDeferred;
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
 * Route `load` hooks: parallel enter loads, SWR cache, prefetch handoff.
 * One instance per {@link AuraRoutingEngine} (navigation load, prefetch).
 * View/HTML stays in `core/view-graph/`. Child may `await ctx.parent()`; default is parallel.
 *
 * Shared prepare: {@link HandoffCache.hold} → hooks/`workSignal`; interest →
 * {@link awaitUntilAbort}; `finally` → release. Long revisit stays in {@link AuraResolvableCache}.
 */
export class DataGraph {
  private static defaultCacheOptions: DataGraphCacheOptions = {};

  private readonly hooks: HookRegistry;
  private readonly cache: AuraResolvableCache<unknown>;
  private readonly sharedBuffer: HandoffCache;

  /** Default `cache.data` options for engine-created graphs. */
  static configure(options: DataGraphCacheOptions = {}): void {
    DataGraph.defaultCacheOptions = { ...DataGraph.defaultCacheOptions, ...options };
  }

  constructor(sharedBuffer: HandoffCache, deps: DataGraphDeps) {
    this.hooks = deps.hooks;
    this.sharedBuffer = sharedBuffer;
    const merged = { ...DataGraph.defaultCacheOptions, ...deps.cache };
    this.cache = new AuraResolvableCache({
      max: merged.max,
      staleTime: merged.staleTime ?? 30_000,
      gcTime: merged.gcTime ?? DATA_CACHE_GC_TIME,
      gcSweepInterval: false,
    });
  }

  /**
   * Parallel enter-route loads.
   * Primary navigation entry (ResourceGraph / {@link ViewGraph.load} twin).
   * On error → `{ error }` only (no partial sibling data).
   */
  async load(
    enterRoutes: readonly MatchedRouteInfo[],
    options: DataGraphLoadOptions,
  ): Promise<DataGraphLoadResult> {
    const { error, data } = await this.loadEnterRoutes(
      enterRoutes,
      options.branch ?? enterRoutes,
      options.transaction,
      options.mode,
    );
    return error ? { error } : { data };
  }

  /**
   * Prefetch warmup for enter routes.
   * Keeps partial `data`; never fails the caller (same soft contract as {@link ViewGraph.prefetch}).
   */
  async prefetch(
    enterRoutes: readonly MatchedRouteInfo[],
    options: DataGraphLoadOptions,
  ): Promise<DataGraphLoadResult> {
    return this.loadEnterRoutes(
      enterRoutes,
      options.branch ?? enterRoutes,
      options.transaction,
      'prefetch',
    );
  }

  /** Invalidate payload cache entries ({@link RouterInvalidateOptions}, default policy `stale`). */
  invalidate(options: RouterInvalidateOptions = {}): number {
    return invalidateRouterCache(this.cache, options, 'stale');
  }

  /** Cached `cache.data` payloads on the branch, or `undefined` when empty. */
  snapshot(branch: readonly MatchedRouteInfo[]): DataSnapshot | undefined {
    const data = new Map<string, unknown>();
    for (const match of branch) {
      if (!match.route.hasDataCache) continue;
      const key = match.dataKey;
      if (!key) continue;
      const value = this.cache.get(key);
      if (value !== undefined) data.set(key, value);
    }
    return data.size > 0 ? data : undefined;
  }

  getData(match: MatchedRouteInfo): unknown {
    const key = match.dataKey;
    return key ? this.cache.get(key) : undefined;
  }

  destroy(): void {
    this.cache.destroy();
  }

  /**
   * Parallel enter loads. Interest abort detaches callers; work abort — see {@link HandoffWorkRegistry}.
   */
  private async loadEnterRoutes(
    enterRoutes: readonly MatchedRouteInfo[],
    branch: readonly MatchedRouteInfo[],
    transaction: NavigationTransaction,
    mode: LoadHookMode,
  ): Promise<DataGraphRouteLoadResult<Map<string, unknown>>> {
    const siblingAbort = new AbortController();
    const interestSignal = AbortSignal.any([transaction.signal, siblingAbort.signal]);
    const deferreds = createPayloadDeferredTable(enterRoutes);
    const result = new Map<string, unknown>();
    const errors: TerminalOutcome[] = [];

    await Promise.all(
      enterRoutes.map(async (match, index) => {
        const deferred = deferreds.get(match.route.uid)!;
        if (!match.dataKey) {
          deferred.resolve(undefined);
          return;
        }

        const { error, data } = await this.loadEnterRoute({
          match,
          transaction,
          interestSignal,
          siblingAbort,
          mode,
          parent: () => this.resolveParentDeferred(match, deferreds, branch),
          deferred,
        });

        if (error) {
          errors[index] = error;
          siblingAbort.abort();
          return;
        }

        result.set(match.dataKey, data);
      }),
    );

    return { error: errors.find(Boolean), data: result };
  }

  private async loadEnterRoute(request: EnterRouteLoad): Promise<DataGraphRouteLoadResult> {
    const { match, transaction, interestSignal, mode, parent, deferred } = request;

    const hookNames = resolveHookNames(match.route, 'load');
    if (!hookNames) {
      deferred.resolve(undefined);
      return SKIP_RESULT;
    }

    const waiter = this.sharedBuffer.hold(match.dataKey!, mode);

    try {
      const shared = this.runSharedLoad(match, () =>
        this.callLoadHooks(
          this.buildLoadHookContext(match, transaction, {
            transactionSignal: waiter.workSignal,
            parent,
          }),
          hookNames,
        ),
      );
      // Batch deferred follows shared settle; waiter follows interestSignal.
      void shared.then(deferred.resolve, deferred.reject);
      const data = await awaitUntilAbort(shared, interestSignal);

      // Also handled in catch when interest aborts before settle.
      if (!isInterestActive(request)) return cancelledResult(mode);

      if (mode === 'navigation') {
        match.route.onLoad(
          this.buildLoadHookContext(match, transaction, {
            transactionSignal: transaction.signal,
            parent,
            data,
          }),
        );
      }

      return { data };
    } catch (error) {
      return this.toLoadErrorResult(error, request);
    } finally {
      waiter.release();
    }
  }

  /**
   * Handoff (+ optional long `cache.data`).
   * Factory uses the waiter {@link HandoffWaiter.workSignal}, not caller interest.
   */
  private runSharedLoad(
    match: MatchedRouteInfo,
    load: () => Promise<DataGraphRouteLoadResult>,
  ): Promise<unknown> {
    const { dataKey } = match;
    if (!dataKey) return Promise.resolve(undefined);

    return this.sharedBuffer.resolve(dataKey, async () => {
      const useLongCache = match.route.hasDataCache;
      if (useLongCache) {
        const cachedValue = this.cache.get(dataKey);
        if (cachedValue !== undefined) return cachedValue;
      }

      const { data, error } = await load();
      if (error) throw new DataGraphTerminalError(error);

      if (useLongCache) this.cache.set(dataKey, data);
      return data;
    });
  }

  private async callLoadHooks(
    context: RouteLifecycleContext,
    hookNames: readonly string[],
  ): Promise<DataGraphRouteLoadResult> {
    const values = await Promise.all(
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

    if (hookNames.length === 1) return { data: values[0] };

    const data: Record<string, unknown> = {};
    for (let i = 0; i < hookNames.length; i++) {
      data[hookNames[i]!] = values[i];
    }
    return { data };
  }

  private buildLoadHookContext(
    match: MatchedRouteInfo,
    transaction: NavigationTransaction,
    extras: {
      transactionSignal: AbortSignal;
      parent: () => Promise<unknown>;
      data?: unknown;
    },
  ): RouteLifecycleContext {
    return NavigationTransactionPipelinePhase.buildPhaseContext('load', match, {
      from: transaction.from,
      action: transaction.action,
      router: transaction.engine.router,
      transactionId: transaction.transactionId,
      transactionSignal: extras.transactionSignal,
      parent: extras.parent,
      ...(extras.data !== undefined && { data: extras.data }),
    });
  }

  private async toLoadErrorResult(
    error: unknown,
    request: EnterRouteLoad,
  ): Promise<DataGraphRouteLoadResult> {
    const { match, transaction, mode } = request;

    if (mode === 'prefetch') return SKIP_RESULT;
    if (error instanceof DataGraphTerminalError) return { error: error.outcome };
    if (!isInterestActive(request)) return CANCELLED_RESULT;
    return { error: await transaction.fail(match, error, 'load') };
  }

  /** Nearest ancestor payload: in-batch deferred → handoff → long cache. */
  private resolveParentDeferred(
    child: MatchedRouteInfo,
    deferreds: ReadonlyMap<number, PayloadDeferred>,
    branch: readonly MatchedRouteInfo[],
  ): Promise<unknown> {
    const parent = closestRouteWithLoadHooks(child, branch);
    if (!parent) return Promise.resolve(undefined);

    const parentDeferred = deferreds.get(parent.route.uid);
    if (parentDeferred) return parentDeferred.promise;

    const dataKey = parent.dataKey;
    if (!dataKey) return Promise.resolve(undefined);

    const joined = this.sharedBuffer.join(dataKey);
    if (!joined) return Promise.resolve(this.cache.get(dataKey));
    return joined.catch(() => this.cache.get(dataKey));
  }
}

function createPayloadDeferredTable(
  enterRoutes: readonly MatchedRouteInfo[],
): Map<number, PayloadDeferred> {
  const table = new Map<number, PayloadDeferred>();
  for (const match of enterRoutes) {
    const deferred = promiseWithResolvers();
    void deferred.promise.catch(() => {
    }); // no child may await parent()
    table.set(match.route.uid, deferred);
  }
  return table;
}

function cancelledResult(mode: LoadHookMode): DataGraphRouteLoadResult {
  return mode === 'prefetch' ? SKIP_RESULT : CANCELLED_RESULT;
}

function isInterestActive(request: EnterRouteLoad): boolean {
  return request.transaction.isActive() && !request.siblingAbort.signal.aborted;
}

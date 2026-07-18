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
import { awaitUntilAbort } from '../../../aura-utils/async/await-until-abort';
import { promiseWithResolvers } from '../../../aura-utils/async/promises';
import { HandoffCache } from '../resource-graph';

export type DataSnapshot = ReadonlyMap<string, unknown>;

type TerminalOutcome = Exclude<PipelineStepResult, null>;

/**
 * `{ data }` ok · `{ error }` navigation stop · `{}` soft skip (no hooks / prefetch).
 * {@link DataGraph.load} drops partial `data` on error; {@link DataGraph.prefetch} keeps it.
 */
type LoadResult<T = unknown> = {
  data?: T;
  error?: TerminalOutcome;
};

export type DataGraphLoadResult = LoadResult<DataSnapshot>;

export type DataGraphOptions = Pick<CacheStoreOptions<unknown>, 'max' | 'staleTime' | 'gcTime'>;

export type LoadHookMode = 'navigation' | 'prefetch';

export type DataGraphLoadOptions = {
  /** Full active branch (root → leaf), including LCA parents outside enterRoutes. */
  branch?: readonly MatchedRouteInfo[];
  transaction: NavigationTransaction;
  mode: LoadHookMode;
};

/** @deprecated Use {@link DataGraphLoadOptions}. */
export type DataGraphPrefetchOptions = DataGraphLoadOptions;

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

/** Never aborted — shared handoff load must outlive caller interest. */
const SHARED_HANDOFF_SIGNAL = new AbortController().signal;

/**
 * Route `load` hooks: parallel enter loads, SWR cache, prefetch handoff.
 * View/HTML stays in `core/view-graph/`. Child may `await ctx.parent()`; default is parallel.
 */
export class DataGraph {
  private static defaultOptions: DataGraphOptions = {};

  private readonly cache: AuraResolvableCache<unknown>;
  private readonly hooks: HookRegistry;
  private readonly sharedBuffer: HandoffCache;

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

  /** Navigation load. On error → `{ error }` only (no partial sibling data). */
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

  /** Prefetch warmup. Keeps partial `data`; never fails the caller. */
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

  /** Parallel enter loads. Abort detaches waiters only — handoff keeps running. */
  private async loadEnterRoutes(
    enterRoutes: readonly MatchedRouteInfo[],
    branch: readonly MatchedRouteInfo[],
    transaction: NavigationTransaction,
    mode: LoadHookMode,
  ): Promise<LoadResult<Map<string, unknown>>> {
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

  private async loadEnterRoute(request: EnterRouteLoad): Promise<LoadResult> {
    const { match, transaction, interestSignal, mode, parent, deferred } = request;

    const hookNames = routeLoadHookNames(match);
    if (!hookNames) {
      deferred.resolve(undefined);
      return {};
    }

    try {
      const shared = this.runSharedLoad(match, () =>
        this.callLoadHooks(
          this.buildLoadHookContext(match, transaction, {
            transactionSignal: SHARED_HANDOFF_SIGNAL,
            parent,
          }),
          hookNames,
        ),
      );
      // Batch deferred follows shared settle; waiter follows interestSignal.
      void shared.then(deferred.resolve, deferred.reject);
      const data = await awaitUntilAbort(shared, interestSignal);

      // Also handled in catch when interest aborts before settle.
      if (!isRequestActive(request)) {
        return mode === 'prefetch' ? {} : { error: { status: 'cancelled' } };
      }

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
    }
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
  ): Promise<LoadResult> {
    const { match, transaction, mode } = request;

    if (mode === 'prefetch') return {};
    if (error instanceof DataGraphTerminalError) return { error: error.outcome };
    if (!isRequestActive(request)) return { error: { status: 'cancelled' } };
    return { error: await transaction.fail(match, error, 'load') };
  }

  /** Handoff (+ optional long `cache.data`). Factory ignores caller interest. */
  private runSharedLoad(
    match: MatchedRouteInfo,
    load: () => Promise<LoadResult>,
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
  ): Promise<LoadResult> {
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

function isRequestActive(request: EnterRouteLoad): boolean {
  return request.transaction.isActive() && !request.siblingAbort.signal.aborted;
}

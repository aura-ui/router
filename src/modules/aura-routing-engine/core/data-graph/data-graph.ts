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
  branch?: readonly MatchedRouteInfo[];
  transaction: NavigationTransaction;
  mode: LoadHookMode;
};

/** @deprecated Use {@link DataGraphLoadOptions}. */
export type DataGraphPrefetchOptions = DataGraphLoadOptions;

/** Per-enter deferred payload — children join via `ctx.parent()`. */
type PayloadJoin = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

/** Inputs for loading a single enter-route within a parallel batch. */
type EnterRouteLoad = {
  match: MatchedRouteInfo;
  transaction: NavigationTransaction;
  /** Supersede / sibling terminal — not the shared handoff factory. */
  interestSignal: AbortSignal;
  siblingAbort: AbortController;
  mode: LoadHookMode;
  parent: () => Promise<unknown>;
  join: PayloadJoin;
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
 * Shared prepare work is not tied to a caller transaction.
 * Caller abort detaches the waiter via {@link awaitUntilAbort}; underlying load keeps running
 * for handoff join (speculative → navigation), same contract as `import::`.
 */
const SHARED_HANDOFF_SIGNAL = new AbortController().signal;

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
  /** Short-TTL handoff between speculative prepare and navigation (shared Promise join). */
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

  /**
   * Blocking navigation load — after history commit, before render.
   * @param enterRoutes Routes entering this transition (LCA delta); load hooks run only here.
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
    // Navigation callers treat error as terminal — omit partial batch data.
    return error ? { error } : { data };
  }

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

  /**
   * Load all enter routes in parallel.
   * Caller/sibling abort detaches waiters only — handoff work keeps running.
   * `ctx.parent()` joins the nearest ancestor shared payload (or cache for LCA parents outside enter).
   */
  private async loadEnterRoutes(
    enterRoutes: readonly MatchedRouteInfo[],
    branch: readonly MatchedRouteInfo[],
    transaction: NavigationTransaction,
    mode: LoadHookMode,
  ): Promise<LoadResult<Map<string, unknown>>> {
    if (enterRoutes.length === 0) return { data: new Map() };

    const siblingAbort = new AbortController();
    const interestSignal = AbortSignal.any([transaction.signal, siblingAbort.signal]);
    const joins = createPayloadJoinTable(enterRoutes);
    const result = new Map<string, unknown>();
    let terminalError: TerminalOutcome | undefined;
    let terminalIndex = -1;

    await Promise.all(
      enterRoutes.map(async (match, index) => {
        const join = joins.get(match.route.uid)!;
        if (!match.dataKey) {
          join.resolve(undefined);
          return;
        }

        const { error, data } = await this.loadEnterRoute({
          match,
          transaction,
          interestSignal,
          siblingAbort,
          mode,
          parent: () => this.joinParentPayload(match, joins, branch),
          join,
        });

        if (error) {
          if (terminalIndex < 0 || index < terminalIndex) {
            terminalIndex = index;
            terminalError = error;
          }
          siblingAbort.abort();
          return;
        }

        result.set(match.dataKey, data);
      }),
    );

    return { error: terminalError, data: result };
  }

  /**
   * One enter-route: resolve/join shared payload → wait under interest → `onLoad` (navigation).
   */
  private async loadEnterRoute(request: EnterRouteLoad): Promise<LoadResult> {
    const { match, join, mode } = request;

    const hookNames = routeLoadHookNames(match);
    if (!hookNames) {
      join.resolve(undefined);
      return {};
    }

    try {
      const data = await this.waitSharedPayload(request, hookNames);

      if (!isBatchActive(request)) {
        return mode === 'prefetch' ? {} : { error: { status: 'cancelled' } };
      }

      if (mode === 'navigation') {
        this.notifyOnLoad(request, data);
      }

      return { data };
    } catch (error) {
      return this.toLoadErrorResult(error, request);
    }
  }

  /**
   * Start/join handoff work, publish settle to the batch join table, wait under caller interest.
   * Parent/sibling joins follow shared settle — not waiter interest.
   */
  private waitSharedPayload(
    request: EnterRouteLoad,
    hookNames: readonly string[],
  ): Promise<unknown> {
    const { match, interestSignal, parent, join } = request;

    const shared = this.resolveSharedPayload(match, () => {
      const loadCtx = this.buildLoadHookContext(match, request.transaction, {
        transactionSignal: SHARED_HANDOFF_SIGNAL,
        parent,
      });
      return this.invokeLoadHooks(loadCtx, hookNames);
    });

    void shared.then(join.resolve, join.reject);
    return awaitUntilAbort(shared, interestSignal);
  }

  /** Immutable pipeline step: runs on every navigation accept, including cache hits. */
  private notifyOnLoad(request: EnterRouteLoad, data: unknown): void {
    const { match, transaction, parent } = request;
    match.route.onLoad(
      this.buildLoadHookContext(match, transaction, {
        transactionSignal: transaction.signal,
        parent,
        data,
      }),
    );
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

    if (mode === 'prefetch') {
      return { data: undefined };
    }
    if (error instanceof DataGraphTerminalError) {
      return { error: error.outcome };
    }
    // Covers tx abort/stale and sibling terminal — interestSignal is a subset of this.
    if (!isBatchActive(request)) {
      return { error: { status: 'cancelled' } };
    }
    return { error: await transaction.fail(match, error, 'load') };
  }

  /**
   * Resolve route payload through handoff (+ optional long `cache.data`).
   * Factory must not consult caller interest — it is shared across transactions.
   */
  private resolveSharedPayload(
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
      if (error) {
        throw new DataGraphTerminalError(error);
      }

      if (useLongCache) {
        this.cache.set(dataKey, data);
      }
      return data;
    });
  }

  /**
   * Invoke named load hooks in parallel; returns `{ data }`.
   * Does not invoke `onLoad` — caller runs it after the waiter accepts the result.
   * Thrown loader errors propagate to {@link loadEnterRoute}.
   */
  private async invokeLoadHooks(
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

    if (hookNames.length === 1) {
      return { data: values[0] };
    }

    const data: Record<string, unknown> = {};
    for (let i = 0; i < hookNames.length; i++) {
      data[hookNames[i]!] = values[i];
    }
    return { data };
  }

  /** Join nearest ancestor load payload (in-batch → handoff → persisted cache). */
  private joinParentPayload(
    child: MatchedRouteInfo,
    joins: ReadonlyMap<number, PayloadJoin>,
    branch: readonly MatchedRouteInfo[],
  ): Promise<unknown> {
    const parent = closestRouteWithLoadHooks(child, branch);
    if (!parent) return Promise.resolve(undefined);

    const inBatch = joins.get(parent.route.uid);
    if (inBatch) return inBatch.promise;

    const dataKey = parent.dataKey;
    if (!dataKey) return Promise.resolve(undefined);

    return this.joinHandoffOrCache(dataKey);
  }

  /** Prefer handoff (in-flight or settled); fall back to long cache on miss/failure. */
  private joinHandoffOrCache(dataKey: string): Promise<unknown> {
    const joined = this.sharedBuffer.join(dataKey);
    if (!joined) return Promise.resolve(this.cache.get(dataKey));
    return joined.catch(() => this.cache.get(dataKey));
  }

  invalidate(options: RouterInvalidateOptions = {}): number {
    return invalidateRouterCache(this.cache, options, 'stale');
  }

  /**
   * Reads cached load-hook payloads for `cache.data` routes on the active branch.
   * @returns `undefined` when no preserved entries — keeps truthy checks meaningful downstream.
   */
  snapshot(branch: readonly MatchedRouteInfo[]): DataSnapshot | undefined {
    const data = new Map<string, unknown>();
    for (const match of branch) {
      if (!match.route.hasDataCache) continue;
      const key = match.dataKey;
      if (!key) continue;
      const value = this.cache.get(key);
      if (value !== undefined) {
        data.set(key, value);
      }
    }
    return data.size > 0 ? data : undefined;
  }

  getData(match: MatchedRouteInfo): unknown {
    const key = match.dataKey;
    if (!key) return undefined;
    return this.cache.get(key);
  }

  destroy(): void {
    this.cache.destroy();
  }
}

/** Deferred payloads keyed by route uid — children join via `ctx.parent()`. */
function createPayloadJoinTable(
  enterRoutes: readonly MatchedRouteInfo[],
): Map<number, PayloadJoin> {
  const table = new Map<number, PayloadJoin>();

  for (const match of enterRoutes) {
    const join = promiseWithResolvers();
    // Avoid unhandledrejection when no child awaits ctx.parent().
    void join.promise.catch(() => {});
    table.set(match.route.uid, join);
  }

  return table;
}

function isBatchActive(request: EnterRouteLoad): boolean {
  return request.transaction.isActive() && !request.siblingAbort.signal.aborted;
}

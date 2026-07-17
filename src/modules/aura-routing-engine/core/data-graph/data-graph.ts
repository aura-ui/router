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

/** In-flight / settled payload for one enter route — used by `ctx.parent()` joins. */
type PayloadJoinHandle = {
  match: MatchedRouteInfo;
  payload: Promise<unknown>;
};

type PayloadJoinDeferred = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type PayloadJoinTable = {
  handles: Map<number, PayloadJoinHandle>;
  deferreds: Map<number, PayloadJoinDeferred>;
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
  deferred: PayloadJoinDeferred;
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
  private readonly handoff: HandoffCache;

  static configure(options: DataGraphOptions = {}): void {
    DataGraph.defaultOptions = { ...DataGraph.defaultOptions, ...options };
  }

  constructor(hooks: HookRegistry, handoff: HandoffCache, options: DataGraphOptions = {}) {
    this.hooks = hooks;
    this.handoff = handoff;
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
    const { transaction, mode } = options;
    const branch = options.branch ?? enterRoutes;
    const result = await this.loadEnterRoutes(enterRoutes, branch, transaction, mode);
    // Navigation callers treat error as terminal — omit partial batch data.
    if (result.error) return { error: result.error };
    return { data: result.data };
  }

  async prefetch(
    enterRoutes: readonly MatchedRouteInfo[],
    options: DataGraphLoadOptions,
  ): Promise<DataGraphLoadResult> {
    const { transaction } = options;
    const branch = options.branch ?? enterRoutes;
    return this.loadEnterRoutes(enterRoutes, branch, transaction, 'prefetch');
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
    const siblingAbort = new AbortController();
    const interestSignal = AbortSignal.any([transaction.signal, siblingAbort.signal]);
    const errors: PipelineStepResult[] = [];
    const { handles, deferreds } = this.createPayloadJoinTable(enterRoutes);
    const result = new Map<string, unknown>();

    await Promise.all(
      enterRoutes.map(async (match, index) => {
        if (!match.dataKey) return;

        const deferred = deferreds.get(match.route.uid)!;
        const { error, data } = await this.loadEnterRoute({
          match,
          transaction,
          interestSignal,
          siblingAbort,
          mode,
          parent: () => this.joinParentPayload(match, handles, branch),
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

    return { error: errors.find((entry) => entry), data: result };
  }

  /**
   * Wait for one enter-route payload under caller interest, then run `onLoad` (navigation only).
   * Shared handoff work is started/joined via {@link resolveSharedPayload}.
   */
  private async loadEnterRoute(request: EnterRouteLoad): Promise<LoadResult> {
    const { match, transaction, interestSignal, siblingAbort, mode, parent, deferred } = request;

    const hookNames = routeLoadHookNames(match);
    if (!hookNames) {
      deferred.resolve(undefined);
      return {};
    }

    const isActive = () => transaction.isActive() && !siblingAbort.signal.aborted;
    const loadCtx = this.buildLoadHookContext(match, transaction, {
      transactionSignal: SHARED_HANDOFF_SIGNAL,
      parent,
    });

    try {
      const shared = this.resolveSharedPayload(match, () => this.invokeLoadHooks(loadCtx, hookNames));
      // parent() / sibling join follow shared settle — not waiter interest.
      void shared.then(deferred.resolve, deferred.reject);

      const data = await awaitUntilAbort(shared, interestSignal);

      if (!isActive()) {
        return mode === 'prefetch' ? {} : { error: { status: 'cancelled' } };
      }

      // Immutable pipeline step: onLoad runs on every navigation, including cache hits.
      if (mode === 'navigation') {
        const onLoadCtx = this.buildLoadHookContext(match, transaction, {
          transactionSignal: transaction.signal,
          parent,
          data,
        });
        match.route.onLoad(onLoadCtx);
      }

      return { data };
    } catch (error) {
      return this.toLoadErrorResult(error, request, isActive);
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
    isActive: () => boolean,
  ): Promise<LoadResult> {
    const { match, transaction, interestSignal, mode } = request;

    if (mode === 'prefetch') {
      return { data: undefined };
    }
    if (error instanceof DataGraphTerminalError) {
      return { error: error.outcome };
    }
    if (!isActive() || interestSignal.aborted) {
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

    return this.handoff.resolve(dataKey, async () => {
      const useLongCache = match.route.hasDataCache;
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
   * Invoke named load hooks in parallel; returns `{ data }` or `{ error }`.
   * Does not invoke `onLoad` — caller runs it after the waiter accepts the result.
   * Thrown loader errors propagate to {@link loadEnterRoute}.
   */
  private async invokeLoadHooks(
    context: RouteLifecycleContext,
    hookNames: readonly string[],
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

    if (hookNames.length === 1) {
      return { data: response[0] };
    }

    const data: Record<string, unknown> = {};
    for (let i = 0; i < hookNames.length; i++) {
      data[hookNames[i]] = response[i];
    }
    return { data };
  }

  /** Deferred payloads keyed by route uid — children join via `ctx.parent()`. */
  private createPayloadJoinTable(enterRoutes: readonly MatchedRouteInfo[]): PayloadJoinTable {
    const handles = new Map<number, PayloadJoinHandle>();
    const deferreds = new Map<number, PayloadJoinDeferred>();

    for (const match of enterRoutes) {
      const { promise, resolve, reject } = promiseWithResolvers();
      // Avoid unhandledrejection when no child awaits ctx.parent().
      void promise.catch(() => {
      });
      const key = match.route.uid;
      deferreds.set(key, { promise, resolve, reject });
      handles.set(key, { match, payload: promise });
    }

    return { handles, deferreds };
  }

  /** Join nearest ancestor load payload (in-batch, handoff, or persisted cache). */
  private async joinParentPayload(
    child: MatchedRouteInfo,
    handles: ReadonlyMap<number, PayloadJoinHandle>,
    branch: readonly MatchedRouteInfo[],
  ): Promise<unknown> {
    const parent = closestRouteWithLoadHooks(child, branch);
    if (!parent) return undefined;

    const inFlight = handles.get(parent.route.uid);
    if (inFlight) return inFlight.payload;

    const dataKey = parent.dataKey;
    if (!dataKey) return undefined;

    // Handoff first (in-flight or settled); long cache only with cache.data.
    const joined = this.handoff.join(dataKey);
    if (joined) {
      try {
        return await joined;
      } catch {
        // Handoff failed — fall back to persisted cache when present.
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
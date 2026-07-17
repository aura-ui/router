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

type RouteLoadDescriptor = {
  hookNames: readonly string[];
  key: string;
};

/** In-flight / settled load payload for one enter route within a single `load()` call. */
type RouteLoadHandle = {
  match: MatchedRouteInfo;
  payload: Promise<unknown>;
};

type PayloadDeferred = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type PayloadHandles = {
  handles: Map<number, RouteLoadHandle>;
  deferreds: Map<number, PayloadDeferred>;
};

/** Shared inputs for one enter-route load within a parallel batch. */
type RouteLoadBatch = {
  match: MatchedRouteInfo;
  transaction: NavigationTransaction;
  /** Supersede / sibling terminal — not the shared handoff factory. */
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
 * Shared prepare work is not tied to a caller transaction.
 * Caller abort detaches the waiter via {@link awaitUntilAbort}; underlying load keeps running
 * for handoff join (speculative → navigation), same contract as `import::`.
 */
const SHARED_LOAD_SIGNAL = new AbortController().signal;

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
    const { transaction, mode } = options;
    const branch = options.branch ?? enterRoutes;
    const result = await this.loadParallelRoutes(enterRoutes, branch, transaction, mode);
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
    return this.loadParallelRoutes(enterRoutes, branch, transaction, 'prefetch');
  }

  /**
   * Parallel enter loads. Caller/sibling abort detaches waiters only — handoff work keeps running.
   * `ctx.parent()` joins the nearest ancestor shared payload (or cache for LCA parents outside enter).
   */
  private async loadParallelRoutes(
    enterRoutes: readonly MatchedRouteInfo[],
    branch: readonly MatchedRouteInfo[],
    transaction: NavigationTransaction,
    mode: LoadHookMode,
  ): Promise<LoadResult<Map<string, unknown>>> {
    const siblingAbort = new AbortController();
    const interestSignal = AbortSignal.any([transaction.signal, siblingAbort.signal]);
    const errors: PipelineStepResult[] = [];
    const { handles, deferreds } = this.createPayloadHandles(enterRoutes);
    const result = new Map<string, unknown>();

    await Promise.all(
      enterRoutes.map(async (match, index) => {
        if (!match.dataKey) return;

        const deferred = deferreds.get(match.route.uid)!;
        const { error, data } = await this.ensureRouteLoad({
          match,
          transaction,
          interestSignal,
          siblingAbort,
          mode,
          parent: () => this.awaitParentPayload(match, handles, branch),
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

  private async ensureRouteLoad(batch: RouteLoadBatch): Promise<LoadResult> {
    const { match, transaction, interestSignal, siblingAbort, mode, parent, deferred } = batch;

    const hookNames = routeLoadHookNames(match);
    if (!hookNames) {
      deferred.resolve(undefined);
      return {};
    }

    const isActive = () => transaction.isActive() && !siblingAbort.signal.aborted;
    const loadCtx = this.buildLoadContext(match, transaction, {
      transactionSignal: SHARED_LOAD_SIGNAL,
      parent,
    });

    try {
      const shared = this.getRouteData(match, () => this.runHookLoaders(loadCtx, hookNames));
      // parent() / sibling join follow shared settle — not waiter interest.
      void shared.then(deferred.resolve, deferred.reject);

      const data = await awaitUntilAbort(shared, interestSignal);

      if (!isActive()) {
        return mode === 'prefetch' ? {} : { error: { status: 'cancelled' } };
      }

      // Immutable pipeline step: onLoad runs on every navigation, including cache hits.
      if (mode === 'navigation') {
        const onLoadCtx = this.buildLoadContext(match, transaction, {
          transactionSignal: transaction.signal,
          parent,
          data,
        });
        match.route.onLoad(onLoadCtx);
      }

      return { data };
    } catch (error) {
      return this.mapRouteLoadError(error, batch, isActive);
    }
  }

  private buildLoadContext(
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

  private async mapRouteLoadError(
    error: unknown,
    batch: RouteLoadBatch,
    isActive: () => boolean,
  ): Promise<LoadResult> {
    const { match, transaction, interestSignal, mode } = batch;

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

  buildRouteLoadDescriptor(match: MatchedRouteInfo): RouteLoadDescriptor | null {
    const hookNames = routeLoadHookNames(match);
    if (!hookNames) return null;
    return { hookNames, key: match.dataKey! };
  }

  private getRouteData(
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

      useLongCache && this.cache.set(dataKey, data);
      return data;
    });
  }

  /**
   * Runs load hooks in parallel; returns `{ data }` or `{ error }`.
   * Does not invoke `onLoad` — caller runs it after the waiter accepts the result.
   * Thrown loader errors propagate to {@link ensureRouteLoad}.
   * Must not consult caller interest — this factory is shared via handoff.
   */
  private async runHookLoaders(
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

  private createPayloadHandles(enterRoutes: readonly MatchedRouteInfo[]): PayloadHandles {
    const handles = new Map<number, RouteLoadHandle>();
    const deferreds = new Map<number, PayloadDeferred>();

    for (const match of enterRoutes) {
      const { promise, resolve, reject } = promiseWithResolvers();
      // Avoid unhandledrejection when no child awaits ctx.parent().
      void promise.catch(() => {});
      const key = match.route.uid;
      deferreds.set(key, { promise, resolve, reject });
      handles.set(key, { match, payload: promise });
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
   * @returns `null` when no preserved entries — keeps truthy checks meaningful downstream.
   */
  snapshot(branch: readonly MatchedRouteInfo[]): DataSnapshot | undefined {
    const data = new Map<string, unknown>();
    for (const match of branch) {
      if (!routePreservesLoadData(match)) continue;
      const descriptor = this.buildRouteLoadDescriptor(match);
      if (!descriptor) continue;
      const value = this.cache.get(descriptor.key);
      if (value !== undefined) {
        data.set(descriptor.key, value);
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

function routePreservesLoadData(match: MatchedRouteInfo): boolean {
  return match.route.cache?.data ?? false;
}

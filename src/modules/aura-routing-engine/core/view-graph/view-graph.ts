import type { CacheStoreOptions } from '../../../aura-cache-store/core';
import { AuraResolvableCache } from '../../../aura-cache-store/core/aura-resolvable-cache';
import { runConcurrent } from '../../../aura-utils/async/run-concurrent';
import { awaitUntilAbort } from '../../../aura-utils/async/await-until-abort';
import { createViewLoadError } from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { viewKey, viewKeyWithData } from '../match/resource-keys';
import {
  invalidateRouterCache,
  type RouterInvalidateOptions,
} from '../invalidate-router-cache';
import type { ResolvedView } from '../route-tree/resolved-view';
import type { ViewDescriptor, ViewLoadContext, ViewPayload } from './types';
import type { CacheFlags } from '../../../aura-route/core/attr/cache-attr-parser';
import { defaultLoaderRegistry, type LoaderRegistry } from './registry';
import { HandoffCache, type HandoffWaiterKind } from '../resource-graph';
import type { DataGraph, LoadHookMode } from '../data-graph';
import type { PipelineStepResult } from '../navigation/types';
import type { NavigationTransaction } from '../navigation/navigation-transaction';

/** Default `cache.view` payload TTL — 12 hours. */
const VIEW_CACHE_GC_TIME = 12 * 60 * 60 * 1000;

/** Options for the long-lived `cache.view` store. */
export type ViewGraphCacheOptions = Pick<CacheStoreOptions<string>, 'max' | 'staleTime' | 'gcTime'>;

export type ViewPrefetchOptions = {
  /** Parallel prefetch cap. Default: `3`. */
  readonly concurrency?: number;
  /** `root-first` matches enter-branch mount order. Default: `root-first`. */
  readonly order?: 'leaf-first' | 'root-first';
};

const DEFAULT_PREFETCH: Required<ViewPrefetchOptions> = {
  concurrency: 3,
  order: 'root-first',
};

type TerminalOutcome = Exclude<PipelineStepResult, null>;

/**
 * `{ data }` ok · `{ error }` navigation stop · `{}` soft skip (no descriptor / prefetch).
 * Same shape as DataGraph load/prefetch results.
 */
export type ViewGraphLoadResult = {
  data?: ViewPayload | null;
  error?: TerminalOutcome;
};

/**
 * Batch {@link ViewGraph.load}: `{ data }` ok · `{ error }` first failure · `{}` empty.
 * On error drops partial sibling results (same as {@link DataGraph.load}).
 */
export type ViewGraphLoadViewsResult = {
  data?: ViewGraphLoadResult[];
  error?: TerminalOutcome;
};

/** Route fields read when building a {@link ViewDescriptor} from {@link MatchedRouteInfo}. */
export type RouteViewSource = {
  readonly layout: string;
  readonly cache: CacheFlags;
  readonly extract?: string | null;
};

export type ViewGraphDeps = {
  /** Defaults to {@link defaultLoaderRegistry}. */
  readonly registry?: LoaderRegistry;
  /** Merged over {@link ViewGraph.configure} defaults for the internal payload cache. */
  readonly cache?: ViewGraphCacheOptions;
};

/** Static view data, or a per-route resolver (e.g. data-bound content in {@link ViewGraph.load}). */
export type ViewDataInput = unknown | ((route: MatchedRouteInfo) => unknown);

export type ViewLoadOptions = {
  readonly data?: ViewDataInput;
  /** Defaults to `navigation`. Prefetch paths pass `prefetch`. */
  readonly mode?: LoadHookMode;
  /**
   * When set, loader failures go through {@link NavigationTransaction.fail}
   * (same as DataGraph). Tests / {@link ViewResolverPort} may omit it — then errors throw.
   */
  readonly transaction?: NavigationTransaction;
};

function resolveViewData(route: MatchedRouteInfo, data: ViewDataInput | undefined): unknown {
  return typeof data === 'function' ? data(route) : data;
}

function isInactive(signal: AbortSignal, transaction?: NavigationTransaction): boolean {
  return signal.aborted || (transaction != null && !transaction.isActive());
}

function cancelledResult(mode: LoadHookMode): ViewGraphLoadResult {
  return mode === 'prefetch' ? {} : { error: { status: 'cancelled' } };
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Aborted', 'AbortError');
}

/**
 * View payload coordinator: descriptor → loader → cache → {@link ViewPayload}.
 * One instance per {@link AuraRoutingEngine} (render, branch-resolve, prefetch).
 *
 * Shared prepare: {@link HandoffCache.hold} → loader/`workSignal`; interest →
 * {@link awaitUntilAbort}; `finally` → release. Long revisit stays in {@link AuraResolvableCache}.
 */
export class ViewGraph {
  private static defaultCacheOptions: ViewGraphCacheOptions = {};

  private readonly registry: LoaderRegistry;
  private readonly cache: AuraResolvableCache<string>;
  private readonly sharedBuffer: HandoffCache;

  /** Default `cache.view` options for engine-created graphs. */
  static configure(options: ViewGraphCacheOptions = {}): void {
    ViewGraph.defaultCacheOptions = { ...ViewGraph.defaultCacheOptions, ...options };
  }

  constructor(sharedBuffer: HandoffCache, deps: ViewGraphDeps = {}) {
    this.registry = deps.registry ?? defaultLoaderRegistry;
    this.sharedBuffer = sharedBuffer;
    const merged = { ...ViewGraph.defaultCacheOptions, ...deps.cache };
    this.cache = new AuraResolvableCache({
      max: merged.max ?? 50,
      staleTime: merged.staleTime,
      gcTime: merged.gcTime ?? VIEW_CACHE_GC_TIME,
      gcSweepInterval: false,
    });
  }

  /**
   * Load payload for a matched route (`layout` or `view` attr).
   * Same outcome shape as DataGraph: `{ data }` / `{ error }` / `{}`.
   */
  loadView(
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    options?: ViewLoadOptions,
  ): Promise<ViewGraphLoadResult> {
    const descriptor = ViewGraph.buildViewDescriptor(
      routeInfo.route as RouteViewSource,
      routeInfo.resolvedView,
    );
    if (!descriptor) return Promise.resolve({});

    return this.loadViewDescriptor(descriptor, routeInfo, signal, options);
  }

  /**
   * Parallel {@link loadView} for independent content routes.
   * Unlike {@link DataGraph.load}: no parent-join, no sibling-abort — but same
   * terminal fold: first `{ error }` wins, partial sibling `data` dropped.
   * Per-route data: pass `options.data` as `(route) => …`.
   */
  async load(
    routes: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options?: ViewLoadOptions,
  ): Promise<ViewGraphLoadViewsResult> {
    if (!routes.length) return {};

    const results = await Promise.all(
      routes.map((route) => this.loadView(route, signal, options)),
    );
    const error = results.find((result) => result.error)?.error;
    return error ? { error } : { data: results };
  }

  /** Direct resolve bypassing route attrs — tests and explicit descriptor loads. */
  async loadViewDescriptor(
    descriptor: ViewDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    options?: ViewLoadOptions,
  ): Promise<ViewGraphLoadResult> {
    const mode = options?.mode ?? 'navigation';
    const transaction = options?.transaction;
    const data = resolveViewData(routeInfo, options?.data);

    if (signal.aborted) return cancelledResult(mode);

    const key = resolveViewCacheKey(routeInfo, data);
    if (!key) return {};

    // Warm long cache → no hold, no handoff.
    const cached = this.fastCacheCheck(descriptor.cache, key, signal, mode, transaction);
    if (cached) return cached;

    const waiter = this.sharedBuffer.hold(key, toHandoffWaiterKind(mode));

    try {
      const shared = this.runSharedLoad(key, descriptor.cache, () =>
        this.runViewLoader(descriptor, routeInfo, waiter.workSignal, data),
      );
      // Interest may detach before settle; don't leave an unhandled rejection on shared.
      void shared.catch(() => {
      });
      const payload = await awaitUntilAbort(shared, signal);

      if (isInactive(signal, transaction)) return cancelledResult(mode);
      return { data: payload };
    } catch (error) {
      return this.toLoadErrorResult(error, routeInfo, signal, mode, transaction);
    } finally {
      waiter.release();
    }
  }

  /** Hit on `cache.view` without touching handoff; `undefined` → miss. */
  private fastCacheCheck(
    useLongCache: boolean,
    key: string,
    signal: AbortSignal,
    mode: LoadHookMode,
    transaction: NavigationTransaction | undefined,
  ): ViewGraphLoadResult | undefined {
    if (!useLongCache) return undefined;

    const cached = this.cache.get(key);
    if (cached === undefined) return undefined;

    if (isInactive(signal, transaction)) return cancelledResult(mode);
    return { data: cached };
  }

  private async toLoadErrorResult(
    error: unknown,
    match: MatchedRouteInfo,
    signal: AbortSignal,
    mode: LoadHookMode,
    transaction: NavigationTransaction | undefined,
  ): Promise<ViewGraphLoadResult> {
    if (mode === 'prefetch') return {};
    if (isInactive(signal, transaction)) return { error: { status: 'cancelled' } };
    if (transaction) {
      return { error: await transaction.fail(match, error, 'render') };
    }
    throw error;
  }

  /**
   * Handoff (+ optional long `cache.view`).
   * Factory uses the waiter {@link HandoffWaiter.workSignal}, not caller interest.
   */
  private runSharedLoad(
    key: string,
    useLongCache: boolean,
    load: () => Promise<ViewPayload | null>,
  ): Promise<ViewPayload | null> {
    return this.sharedBuffer.resolve(key, async () => {
      if (useLongCache) {
        const cached = this.cache.get(key);
        if (cached !== undefined) return cached;
      }

      const payload = await load();

      // Strings only — DocumentFragment is one-shot DOM (mount empties it).
      if (useLongCache && typeof payload === 'string') {
        this.cache.set(key, payload);
      }

      return payload;
    });
  }

  /** Intent prefetch for enter routes with bounded concurrency; never fails the caller. */
  prefetch(
    routes: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options: ViewPrefetchOptions = {},
  ): Promise<void> {
    const { concurrency, order } = { ...DEFAULT_PREFETCH, ...options };
    const ordered = order === 'leaf-first' ? [...routes].reverse() : routes;
    return runConcurrent(
      ordered,
      concurrency,
      (info) => this.loadView(info, signal, { mode: 'prefetch' }),
      signal,
    );
  }

  /** Invalidate payload cache entries ({@link RouterInvalidateOptions}, default policy `stale`). */
  invalidate(options: RouterInvalidateOptions = {}): number {
    return invalidateRouterCache(this.cache, options, 'stale');
  }

  destroy(): void {
    this.cache.destroy();
  }

  /**
   * Run the view loader against `signal` (caller interest or shared {@link HandoffWaiter.workSignal}).
   * Abort must **reject** — never settle `null` into handoff (that would poison the TTL window).
   */
  private async runViewLoader(
    descriptor: ViewDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    data?: unknown,
  ): Promise<ViewPayload | null> {
    throwIfAborted(signal);

    try {
      const result = await this.registry.get(descriptor.loader).load(
        ViewGraph.buildLoadContext(routeInfo, descriptor, signal, data),
      );
      if (!result) return null;
      return result.kind === 'html' ? result.html : result.kind === 'markup' ? result.markup : result.node;
    } catch (error: unknown) {
      throwIfAborted(signal);
      throw createViewLoadError(descriptor.loader, routeInfo.pattern, error);
    }
  }

  private static buildViewDescriptor(
    route: RouteViewSource,
    resolvedView: ResolvedView | null | undefined,
  ): ViewDescriptor | null {
    const layout = route.layout.trim();
    if (layout) return { kind: 'layout', loader: 'template', content: layout, cache: false };
    if (!resolvedView?.loader) return null;

    const descriptor: ViewDescriptor = {
      kind: 'view',
      loader: resolvedView.loader,
      content: resolvedView.content,
      cache: route.cache.view,
    };
    return resolvedView.loader === 'url' && route.extract
      ? { ...descriptor, extract: route.extract }
      : descriptor;
  }

  private static buildLoadContext(
    routeInfo: MatchedRouteInfo,
    descriptor: Pick<ViewDescriptor, 'kind' | 'content' | 'extract'>,
    signal: AbortSignal,
    data?: unknown,
  ): ViewLoadContext {
    return {
      content: descriptor.content,
      kind: descriptor.kind,
      signal,
      route: {
        href: routeInfo.href,
        pattern: routeInfo.pattern,
        ...(routeInfo.params && { params: routeInfo.params }),
        ...(routeInfo.query && { query: routeInfo.query }),
      },
      ...(data !== undefined && { data }),
      ...(descriptor.extract && { extract: descriptor.extract }),
    };
  }
}

/** Prefer precomputed `match.viewKey`; fall back for hand-built matches. */
function resolveViewCacheKey(routeInfo: MatchedRouteInfo, data?: unknown): string | null {
  const base = routeInfo.viewKey ?? viewKey(routeInfo);
  if (!base) return null;
  return data !== undefined ? viewKeyWithData(base, data) : base;
}

function toHandoffWaiterKind(mode: LoadHookMode): HandoffWaiterKind {
  return mode === 'navigation' ? 'navigation' : 'speculative';
}

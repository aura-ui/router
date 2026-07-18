import type { CacheStoreOptions } from '../../../aura-cache-store/core';
import { runConcurrent } from '../../../aura-utils/async/run-concurrent';
import { awaitUntilAbort } from '../../../aura-utils/async/await-until-abort';
import { createViewLoadError } from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { viewKey, viewKeyWithData } from '../match/resource-keys';
import { getActiveChain } from '../route-tree/matched-chain';
import { ViewPayloadCache } from './cache/view-payload-cache';
import type { RouterInvalidateOptions } from '../invalidate-router-cache';
import type { ResolvedView } from '../route-tree/resolved-view';
import type { ViewDescriptor, ViewLoadContext, ViewPayload } from './types';
import type { CacheFlags } from '../../../aura-route/core/attr/cache-attr-parser';
import { defaultLoaderRegistry, type LoaderRegistry } from './registry';
import { HandoffCache, type HandoffWaiterKind } from '../resource-graph';
import type { DataGraph, LoadHookMode } from '../data-graph';
import type { PipelineStepResult } from '../navigation/types';
import type { NavigationTransaction } from '../navigation/navigation-transaction';

/** Options for the long-lived `cache.view` store ({@link ViewPayloadCache}). */
export type ViewGraphCacheOptions = CacheStoreOptions<string>;

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
 * Batch {@link ViewGraph.loadViews}: `{ data }` ok · `{ error }` first failure · `{}` empty.
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
  /** Merged over {@link ViewGraph.configure} defaults for the internal {@link ViewPayloadCache}. */
  readonly cache?: ViewGraphCacheOptions;
};

/** Static view data, or a per-route resolver (e.g. data-bound content in {@link ViewGraph.loadViews}). */
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

/**
 * View payload coordinator: descriptor → loader → cache → {@link ViewPayload}.
 * One instance per {@link AuraRoutingEngine} (render, branch-resolve, prefetch).
 *
 * Shared prepare: {@link HandoffCache.hold} → loader/`workSignal`; interest →
 * {@link awaitUntilAbort}; `finally` → release. Long revisit stays in {@link ViewPayloadCache}.
 */
export class ViewGraph {
  private static defaultCacheOptions: ViewGraphCacheOptions = {};

  private readonly registry: LoaderRegistry;
  private readonly cache: ViewPayloadCache;
  private readonly sharedBuffer: HandoffCache;

  /** Default {@link ViewPayloadCache} options for engine-created graphs. */
  static configure(options: ViewGraphCacheOptions = {}): void {
    ViewGraph.defaultCacheOptions = { ...ViewGraph.defaultCacheOptions, ...options };
  }

  constructor(sharedBuffer: HandoffCache, deps: ViewGraphDeps = {}) {
    this.registry = deps.registry ?? defaultLoaderRegistry;
    this.sharedBuffer = sharedBuffer;
    this.cache = new ViewPayloadCache({
      ...ViewGraph.defaultCacheOptions,
      ...deps.cache,
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

    return this.loadViewDescriptor(
      descriptor,
      routeInfo,
      signal,
      resolveViewData(routeInfo, options?.data),
      options?.mode ?? 'navigation',
      options?.transaction,
    );
  }

  /**
   * Parallel {@link loadView} for independent content routes.
   * Unlike {@link DataGraph.load}: no parent-join, no sibling-abort — but same
   * terminal fold: first `{ error }` wins, partial sibling `data` dropped.
   * Per-route data: pass `options.data` as `(route) => …`.
   */
  async loadViews(
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
    data?: unknown,
    mode: LoadHookMode = 'navigation',
    transaction?: NavigationTransaction,
  ): Promise<ViewGraphLoadResult> {
    if (signal.aborted) {
      return mode === 'prefetch' ? {} : { error: { status: 'cancelled' } };
    }

    // Descriptor implies route content → viewKey (same identity as match time).
    const key = resolveViewCacheKey(routeInfo, data)!;
    const waiter = this.sharedBuffer.hold(key, toHandoffWaiterKind(mode));

    try {
      const shared = this.runSharedLoad(key, descriptor.cache, () =>
        this.loadViewPayload(descriptor, routeInfo, waiter.workSignal, data),
      );
      // Interest may detach before settle; don't leave an unhandled rejection on shared.
      void shared.catch(() => {});
      const payload = await awaitUntilAbort(shared, signal);

      if (signal.aborted || (transaction && !transaction.isActive())) {
        return mode === 'prefetch' ? {} : { error: { status: 'cancelled' } };
      }

      return { data: payload };
    } catch (error) {
      return this.toLoadErrorResult(error, routeInfo, signal, mode, transaction);
    } finally {
      waiter.release();
    }
  }

  private async toLoadErrorResult(
    error: unknown,
    match: MatchedRouteInfo,
    signal: AbortSignal,
    mode: LoadHookMode,
    transaction: NavigationTransaction | undefined,
  ): Promise<ViewGraphLoadResult> {
    if (mode === 'prefetch') return {};
    if (signal.aborted || (transaction && !transaction.isActive())) {
      return { error: { status: 'cancelled' } };
    }
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

      if (useLongCache && payload !== null) {
        // Persist via ViewPayloadCache so DocumentFragment stays write-filtered.
        await this.cache.resolve(key, async () => payload);
      }

      return payload;
    });
  }

  /** Intent prefetch for one route; never fails the caller. */
  async prefetchNode(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void> {
    await this.loadView(routeInfo, signal, { mode: 'prefetch' });
  }

  /** Prefetch enter chain with bounded concurrency. */
  prefetchBranch(
    chain: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options: ViewPrefetchOptions = {},
  ): Promise<void> {
    const { concurrency, order } = { ...DEFAULT_PREFETCH, ...options };
    const ordered = order === 'leaf-first' ? [...chain].reverse() : chain;
    return runConcurrent(ordered, concurrency, (info) => this.prefetchNode(info, signal), signal);
  }

  /** `getActiveChain(leaf)` + {@link prefetchBranch}. */
  prefetchLeaf(
    leaf: MatchedRouteInfo,
    signal: AbortSignal,
    options?: ViewPrefetchOptions,
  ): Promise<void> {
    return this.prefetchBranch(getActiveChain(leaf), signal, options);
  }

  /** Invalidate payload cache entries ({@link RouterInvalidateOptions}, default policy `stale`). */
  invalidate(options: RouterInvalidateOptions = {}): number {
    return this.cache.invalidate(options);
  }

  destroy(): void {
    this.cache.destroy();
  }

  /**
   * Run the view loader against `signal` (caller interest or shared {@link HandoffWaiter.workSignal}).
   * Abort must **reject** — never settle `null` into handoff (that would poison the TTL window).
   */
  private async loadViewPayload(
    descriptor: ViewDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    data?: unknown,
  ): Promise<ViewPayload | null> {
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException('Aborted', 'AbortError');
    }

    try {
      const result = await this.registry.get(descriptor.loader).load(
        ViewGraph.buildLoadContext(routeInfo, descriptor, signal, data),
      );
      if (!result) return null;
      return result.kind === 'html' ? result.html : result.kind === 'markup' ? result.markup : result.node;
    } catch (error: unknown) {
      if (signal.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Aborted', 'AbortError');
      }
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
    return resolvedView.loader === 'url' && route.extract ? { ...descriptor, extract: route.extract } : descriptor;
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

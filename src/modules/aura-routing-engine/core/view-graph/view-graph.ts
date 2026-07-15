import { runConcurrent } from '../../../aura-utils/async/run-concurrent';
import { createViewLoadError } from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { viewKey, viewKeyWithData } from '../match/resource-keys';
import { getActiveChain } from '../route-tree/matched-chain';
import { ViewPayloadCache } from './cache/view-payload-cache';
import type { RouterInvalidateOptions } from '../invalidate-router-cache';
import type { ResolvedView } from '../route-tree/resolved-view';
import type { ViewDescriptor, ViewLoadContext, ViewPayload } from './types';
import type { CacheFlags } from '../../../aura-route/core/attr/cache-attr-parser';
import type { LoaderRegistry } from './registry';

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

/** Route fields read when building a {@link ViewDescriptor} from {@link MatchedRouteInfo}. */
export type RouteViewSource = {
  readonly layout: string;
  readonly cache: CacheFlags;
  readonly extract?: string | null;
};

export type ViewGraphDeps = {
  readonly registry: LoaderRegistry;
  readonly cache: ViewPayloadCache;
};

/**
 * View payload coordinator: descriptor → loader → cache → {@link ViewPayload}.
 * One instance per {@link AuraRouter} (render, branch-resolve, prefetch).
 */
export class ViewGraph {
  private readonly registry: LoaderRegistry;
  private readonly cache: ViewPayloadCache;

  constructor(deps: ViewGraphDeps) {
    this.registry = deps.registry;
    this.cache = deps.cache;
  }

  /**
   * Load payload for a matched route (`layout` or `view` attr).
   * Returns `null` when there is no descriptor, the loader yields nothing, or `signal` is aborted.
   */
  loadView(
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    options?: { data?: unknown },
  ): Promise<ViewPayload | null> {
    const descriptor = ViewGraph.buildViewDescriptor(
      routeInfo.route as RouteViewSource,
      routeInfo.resolvedView,
    );
    return descriptor
      ? this.loadViewDescriptor(descriptor, routeInfo, signal, options?.data)
      : Promise.resolve(null);
  }

  /** Direct resolve bypassing route attrs — tests and explicit descriptor loads. */
  loadViewDescriptor(
    descriptor: ViewDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    data?: unknown,
  ): Promise<ViewPayload | null> {
    if (signal.aborted) return Promise.resolve(null);

    const load = () => this.loadViewPayload(descriptor, routeInfo, signal, data);
    const key = resolveViewCacheKey(routeInfo, data);
    return descriptor.cache && key
      ? this.cache.resolve(key, load)
      : load();
  }

  /** Intent prefetch for one route; errors are swallowed. */
  async prefetchNode(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void> {
    try {
      await this.loadView(routeInfo, signal);
    } catch {
      // mirrors DataGraph.prefetch
    }
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

  private async loadViewPayload(
    descriptor: ViewDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    data?: unknown,
  ): Promise<ViewPayload | null> {
    if (signal.aborted) return null;

    try {
      const result = await this.registry.get(descriptor.loader).load(
        ViewGraph.buildLoadContext(routeInfo, descriptor, signal, data),
      );
      if (!result) return null;
      return result.kind === 'html' ? result.html : result.kind === 'markup' ? result.markup : result.node;
    } catch (error: unknown) {
      if (signal.aborted) return null;
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

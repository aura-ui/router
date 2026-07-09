import type { LoaderType } from '../../../aura-route/core/attr/view-attr-parser';
import { runConcurrent } from '../../../aura-utils/async/run-concurrent';
import { createViewLoadError } from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { getActiveChain } from '../route-tree/matched-chain';
import { payloadCacheKey } from './cache/cache-key';
import { PayloadCache } from './cache/payload-cache';
import type { RouterInvalidateOptions } from '../invalidate-router-cache';
import type { ViewDescriptor, ViewLoadContext, ViewPayload } from './types';
import type { LoaderRegistry } from './registry';

export type ViewPrefetchOptions = {
  readonly concurrency?: number;
  readonly order?: 'leaf-first' | 'root-first';
};

const DEFAULT_PREFETCH: Required<ViewPrefetchOptions> = {
  concurrency: 3,
  order: 'root-first',
};

export type RouteViewSource = {
  readonly layout: string;
  readonly preserve: { readonly view: boolean };
  readonly extract?: string | null;
};

type ResolvedView = {
  readonly type: LoaderType;
  readonly ref: string;
};

export type ViewGraphDeps = {
  readonly registry: LoaderRegistry;
  readonly cache: PayloadCache;
};

export class ViewGraph {
  private readonly registry: LoaderRegistry;
  private readonly cache: PayloadCache;

  constructor(deps: ViewGraphDeps) {
    this.registry = deps.registry;
    this.cache = deps.cache;
  }

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

  loadViewDescriptor(
    descriptor: ViewDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    data?: unknown,
  ): Promise<ViewPayload | null> {
    if (signal.aborted) return Promise.resolve(null);

    const load = () => this.loadViewPayload(descriptor, routeInfo, signal, data);
    return descriptor.cache
      ? this.cache.resolve(payloadCacheKey(descriptor, routeInfo, { data }), load)
      : load();
  }

  async prefetchNode(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void> {
    try {
      await this.loadView(routeInfo, signal);
    } catch {
      // intent prefetch: silent (mirrors DataGraph.prefetch)
    }
  }

  prefetchBranch(
    chain: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options: ViewPrefetchOptions = {},
  ): Promise<void> {
    const { concurrency, order } = { ...DEFAULT_PREFETCH, ...options };
    const ordered = order === 'leaf-first' ? [...chain].reverse() : chain;
    return runConcurrent(ordered, concurrency, (info) => this.prefetchNode(info, signal), signal);
  }

  prefetchLeaf(
    leaf: MatchedRouteInfo,
    signal: AbortSignal,
    options?: ViewPrefetchOptions,
  ): Promise<void> {
    return this.prefetchBranch(getActiveChain(leaf), signal, options);
  }

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
    if (layout) return { kind: 'layout', loader: 'template', ref: layout, cache: false };
    if (!resolvedView?.type) return null;

    const descriptor: ViewDescriptor = {
      kind: 'view',
      loader: resolvedView.type,
      ref: resolvedView.ref,
      cache: route.preserve.view,
    };
    return resolvedView.type === 'url' && route.extract ? { ...descriptor, extract: route.extract } : descriptor;
  }

  private static buildLoadContext(
    routeInfo: MatchedRouteInfo,
    descriptor: Pick<ViewDescriptor, 'kind' | 'ref' | 'extract'>,
    signal: AbortSignal,
    data?: unknown,
  ): ViewLoadContext {
    return {
      ref: descriptor.ref,
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

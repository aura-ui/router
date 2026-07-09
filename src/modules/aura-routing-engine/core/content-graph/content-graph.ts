import { createContentLoadError } from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { getActiveChain } from '../route-tree/matched-chain';
import { payloadCacheKey } from './cache/cache-key';
import { PayloadCache } from './cache/payload-cache';
import type { RouterInvalidateOptions } from '../invalidate-router-cache';
import { DEFAULT_PREFETCH, orderPrefetchChain, prefetchConcurrent, type ContentPrefetchOptions } from './prefetch';
import { buildContentDescriptor, type RouteContentSource } from './model/descriptor';
import { toLoadContext } from './model/context';
import { toViewPayload } from './model/result';
import type { ContentDescriptor, ViewPayload } from './model/types';
import type { LoaderRegistry } from './runtime/registry';

export type ContentGraphDeps = {
  readonly registry: LoaderRegistry;
  readonly cache: PayloadCache;
};

/**
 * View content coordinator: resolve, prefetch, payload cache invalidation.
 * Load-hook data stays in {@link DataGraph}; detached DOM in route ViewCache.
 */
export class ContentGraph {
  private readonly registry: LoaderRegistry;
  private readonly cache: PayloadCache;

  constructor(deps: ContentGraphDeps) {
    this.registry = deps.registry;
    this.cache = deps.cache;
  }

  resolve(
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    options?: { data?: unknown },
  ): Promise<ViewPayload | null> {
    const descriptor = buildContentDescriptor(
      routeInfo.route as RouteContentSource,
      routeInfo.resolvedView,
    );

    if (!descriptor) {
      return Promise.resolve(null);
    }

    return this.resolveDescriptor(descriptor, routeInfo, signal, options?.data);
  }

  resolveDescriptor(
    descriptor: ContentDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    data?: unknown,
  ): Promise<ViewPayload | null> {
    if (signal.aborted) return Promise.resolve(null);

    const load = () => this.loadPayload(descriptor, routeInfo, signal, data);
    if (!descriptor.cache) return load();

    return this.cache.resolve(payloadCacheKey(descriptor, routeInfo), load);
  }

  prefetchNode(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void> {
    return this.resolve(routeInfo, signal).then(() => {});
  }

  prefetchBranch(
    chain: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options: ContentPrefetchOptions = {},
  ): Promise<void> {
    const { concurrency, order } = { ...DEFAULT_PREFETCH, ...options };
    const ordered = orderPrefetchChain(chain, order);

    return prefetchConcurrent(ordered, concurrency, (info) => this.prefetchNode(info, signal));
  }

  prefetchLeaf(
    leaf: MatchedRouteInfo,
    signal: AbortSignal,
    options?: ContentPrefetchOptions,
  ): Promise<void> {
    return this.prefetchBranch(getActiveChain(leaf), signal, options);
  }

  invalidate(options: RouterInvalidateOptions = {}): number {
    return this.cache.invalidate(options);
  }

  private async loadPayload(
    descriptor: ContentDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    data?: unknown,
  ): Promise<ViewPayload | null> {
    if (signal.aborted) return null;

    try {
      const ctx = toLoadContext(routeInfo, descriptor, signal, data);
      const result = await this.registry.get(descriptor.loader).load(ctx);
      return toViewPayload(result);
    } catch (error: unknown) {
      if (signal.aborted) return null;
      throw createContentLoadError(descriptor.loader, routeInfo.pattern, error);
    }
  }
}

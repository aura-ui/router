import { createContentLoadError } from '../failure';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { getActiveChain } from '../route-tree/matched-chain';
import { contentCacheKey } from './cache/content-key';
import type { ContentCache } from './cache/content-cache';
import { toLoadContext } from './loaders/load-context';
import type { LoaderRegistry } from './loaders/registry';
import { buildContentDescriptor, isLoadableDescriptor } from './model/descriptor';
import type { ContentDescriptor, ViewPayload } from './model/types';

export type ContentLoadServiceDeps = {
  registry: LoaderRegistry;
  cache: ContentCache;
};

export type ContentPrefetchOptions = {
  concurrency?: number;
  order?: 'leaf-first' | 'root-first';
};

const DEFAULT_PREFETCH: Required<ContentPrefetchOptions> = {
  concurrency: 3,
  order: 'root-first',
};

/** Route attrs → descriptor → cache → loader → view payload. */
export class ContentLoadService {
  private readonly registry: LoaderRegistry;
  private readonly cache: ContentCache;

  constructor(deps: ContentLoadServiceDeps) {
    this.registry = deps.registry;
    this.cache = deps.cache;
  }

  /** Render and prefetch entry — matches {@link ContentResolverPort}. */
  resolve(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<ViewPayload | null> {
    const descriptor = buildContentDescriptor(routeInfo.route);
    if (!isLoadableDescriptor(descriptor)) {
      return Promise.resolve(null);
    }

    return this.resolveDescriptor(descriptor, routeInfo, signal);
  }

  resolveDescriptor(
    descriptor: ContentDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
  ): Promise<ViewPayload | null> {
    if (signal.aborted) return Promise.resolve(null);

    const load = () => this.runLoader(descriptor, routeInfo, signal);

    if (!descriptor.cache) {
      return load();
    }

    return this.cache.resolve(contentCacheKey(descriptor, routeInfo), load);
  }

  prefetchNode(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void> {
    return this.resolve(routeInfo, signal).then(() => undefined);
  }

  prefetchBranch(
    chain: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options: ContentPrefetchOptions = {},
  ): Promise<void> {
    const { concurrency, order } = { ...DEFAULT_PREFETCH, ...options };
    const ordered = order === 'leaf-first' ? [...chain].reverse() : chain;

    return runConcurrent(ordered, concurrency, (info) => this.prefetchNode(info, signal));
  }

  prefetchLeaf(
    leaf: MatchedRouteInfo,
    signal: AbortSignal,
    options?: ContentPrefetchOptions,
  ): Promise<void> {
    return this.prefetchBranch(getActiveChain(leaf), signal, options);
  }

  private async runLoader(
    descriptor: ContentDescriptor,
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
  ): Promise<ViewPayload | null> {
    if (signal.aborted) return null;

    try {
      return await this.registry.get(descriptor.loader)(
        toLoadContext(routeInfo, descriptor.ref, signal),
      );
    } catch (error: unknown) {
      if (signal.aborted) return null;

      throw createContentLoadError(descriptor.loader, routeInfo.pattern, error);
    }
  }
}

async function runConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const limit = Math.max(1, concurrency);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await run(items[index]!);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

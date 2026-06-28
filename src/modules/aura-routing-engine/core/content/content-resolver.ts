import { createContentLoadError } from '../failure/navigation-error';
import type { ContentDescriptor, LoadContext, ResolveContext, ViewPayload } from './types';
import type { ContentCache } from './content-cache';
import { contentCacheKey } from './content-key';
import type { LoaderRegistry } from './registry';

export type ContentResolverDeps = {
  registry: LoaderRegistry;
  cache: ContentCache;
};

export class ContentResolver {
  private readonly registry: LoaderRegistry;
  private readonly cache: ContentCache;

  constructor(deps: ContentResolverDeps) {
    this.registry = deps.registry;
    this.cache = deps.cache;
  }

  resolve(descriptor: ContentDescriptor, ctx: Omit<ResolveContext, 'purpose'>): Promise<ViewPayload | null> {
    return this.load(descriptor, { ...ctx, purpose: 'render' });
  }

  prefetch(descriptor: ContentDescriptor, ctx: Omit<ResolveContext, 'purpose'>): Promise<void> {
    return this.load(descriptor, { ...ctx, purpose: 'prefetch' }).then(() => undefined);
  }

  load(descriptor: ContentDescriptor, ctx: ResolveContext): Promise<ViewPayload | null> {
    if (ctx.signal.aborted) return Promise.resolve(null);

    if (ctx.purpose === 'prefetch' && !descriptor.cache) {
      return this.fetch(descriptor, ctx);
    }

    return this.loadWithCache(descriptor, ctx);
  }

  private loadWithCache(descriptor: ContentDescriptor, ctx: ResolveContext): Promise<ViewPayload | null> {
    const run = () => this.fetch(descriptor, ctx);

    if (!descriptor.cache) {
      return run();
    }

    const key = contentCacheKey(descriptor, ctx.routeInfo);
    return this.cache.resolve(key, run);
  }

  private async fetch(
    descriptor: ContentDescriptor,
    ctx: ResolveContext,
  ): Promise<ViewPayload | null> {
    if (ctx.signal.aborted) return null;

    const loader = this.registry.get(descriptor.loader);

    try {
      return await loader(this.toLoadContext(descriptor, ctx));
    } catch (error: unknown) {
      if (ctx.signal.aborted) return null;

      throw createContentLoadError(descriptor.loader, ctx.routeInfo.pattern, error);
    }
  }

  private toLoadContext(descriptor: ContentDescriptor, ctx: ResolveContext): LoadContext {
    const { routeInfo } = ctx;
    return {
      ref: descriptor.ref,
      signal: ctx.signal,
      route: {
        href: routeInfo.href,
        pattern: routeInfo.pattern,
        ...(routeInfo.params && { params: routeInfo.params }),
        ...(routeInfo.query && { query: routeInfo.query }),
      },
    };
  }
}

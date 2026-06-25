import type { ViewPayload } from '../view/ports';
import type { ContentCache } from './content-cache';
import { contentCacheKey } from './content-key';
import type { LoaderRegistry } from './registry';
import type { ContentDescriptor, LoadContext, ResolveContext } from './types';

export type ContentResolverDeps = {
  registry: LoaderRegistry;
  cache: ContentCache;
  routePath: string;
};

export class ContentResolver {
  private readonly registry: LoaderRegistry;
  private readonly cache: ContentCache;
  private readonly routePath: string;

  constructor(deps: ContentResolverDeps) {
    this.registry = deps.registry;
    this.cache = deps.cache;
    this.routePath = deps.routePath;
  }

  async resolve(descriptor: ContentDescriptor, ctx: ResolveContext): Promise<ViewPayload | null> {
    if (ctx.signal.aborted) return null;
    return this.load(descriptor, ctx);
  }

  async preload(descriptor: ContentDescriptor, ctx: ResolveContext): Promise<void> {
    if (ctx.signal.aborted) return;
    await this.load(descriptor, ctx);
  }

  private load(descriptor: ContentDescriptor, ctx: ResolveContext): Promise<ViewPayload | null> {
    const run = () => this.fetch(descriptor, ctx);

    if (!descriptor.cache) {
      return run();
    }

    const key = contentCacheKey(descriptor, ctx.routeInfo, this.routePath);
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

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load ${descriptor.loader} for route ${this.routePath}: ${message}`,
      );
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

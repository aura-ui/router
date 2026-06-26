import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { AuraRouteInterface } from './types';
import type { ContentResolverPort } from './view/ports';
import { contentDescriptor } from './loader/descriptor';
import { ContentResolver } from './loader/content-resolver';
import { defaultContentCache, type ContentCache } from './loader/content-cache';
import { defaultLoaderRegistry, type LoaderRegistry } from './loader/registry';

export type RouteContentLoaderOptions = {
  registry?: LoaderRegistry;
  cache?: ContentCache;
};

/** Thin adapter: route attrs → {@link ContentResolver}. */
export class RouteContentLoader implements ContentResolverPort {
  private readonly route: AuraRouteInterface;
  private readonly resolver: ContentResolver;

  constructor(route: AuraRouteInterface, options: RouteContentLoaderOptions = {}) {
    this.route = route;
    this.resolver = new ContentResolver({
      registry: options.registry ?? defaultLoaderRegistry,
      cache: options.cache ?? defaultContentCache,
    });
  }

  preload(signal: AbortSignal): Promise<void> {
    return this.resolver.preload(this.descriptor(), this.context(signal));
  }

  resolve(routeInfo: MatchedRouteInfo, signal: AbortSignal) {
    return this.resolver.resolve(this.descriptor(), { routeInfo, signal });
  }

  private descriptor() {
    return contentDescriptor(this.route);
  }

  private context(signal: AbortSignal, routeInfo?: MatchedRouteInfo): {
    routeInfo: MatchedRouteInfo;
    signal: AbortSignal;
  } {
    return {
      routeInfo: routeInfo ?? {
        href: `/${this.route.path}`,
        pathname: `/${this.route.path}`,
        search: '',
        hash: '',
        pattern: this.route.path,
      } as MatchedRouteInfo,
      signal,
    };
  }
}

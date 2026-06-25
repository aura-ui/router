import {
  ContentLoaderRegistry,
  ContentLoaderService,
} from '../../aura-content-loaders/core';
import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { AuraRouteInterface } from './types';
import type { ContentResolverPort } from './view/ports';

let sharedLoaderService: ContentLoaderService | undefined;

export function configureRouteContentLoader(service: ContentLoaderService): void {
  sharedLoaderService = service;
}

export function resolveRouteContentLoaderService(): ContentLoaderService {
  sharedLoaderService ??= new ContentLoaderService(false);
  return sharedLoaderService;
}

export class RouteContentLoader implements ContentResolverPort {
  private readonly route: AuraRouteInterface;
  private readonly loaderService: ContentLoaderService;

  constructor(route: AuraRouteInterface, loaderService: ContentLoaderService) {
    this.route = route;
    this.loaderService = loaderService;
  }

  async preload(_signal: AbortSignal): Promise<void> {
    // reserved
  }

  async resolve(routeInfo: MatchedRouteInfo, signal: AbortSignal) {
    const loader = ContentLoaderRegistry.create(this.route.source, this.loaderService);

    try {
      return await loader.load(this.route.content, {
        signal,
        componentOptions: {
          href: routeInfo.href,
          pattern: routeInfo.pattern,
          ...(routeInfo.params && { params: routeInfo.params }),
          ...(routeInfo.query && { query: routeInfo.query }),
        },
      });
    } catch (error: unknown) {
      if (signal.aborted) return '';

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${loader.type} content for route ${this.route.path}: ${message}`);
    }
  }
}

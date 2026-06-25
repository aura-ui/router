import {
  ContentLoaderRegistry,
  ContentLoaderService,
} from '../../aura-content-loaders/core';
import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { AuraRouteInterface } from './aura-route';
import type { RouteContentPort } from './view/view-controller.types';

let sharedContentLoaderService: ContentLoaderService | undefined;

export function configureRouteContentLoader(service: ContentLoaderService): void {
  sharedContentLoaderService = service;
}

export function resolveRouteContentLoaderService(): ContentLoaderService {
  sharedContentLoaderService ??= new ContentLoaderService(false);
  return sharedContentLoaderService;
}

export class RouteContentLoader implements RouteContentPort {
  private readonly route: AuraRouteInterface;
  private readonly loaderService: ContentLoaderService;

  constructor(route: AuraRouteInterface, loaderService: ContentLoaderService) {
    this.route = route;
    this.loaderService = loaderService;
  }

  async preload(_signal: AbortSignal): Promise<void> {
    // todo
  }

  readCache(_routeInfo: MatchedRouteInfo): Node | string | null {
    if (!this.route.cache) return null;
    return null;
  }

  writeCache(_routeInfo: MatchedRouteInfo, _payload: Node | string): void {
    if (!this.route.cache) return;
  }

  async resolve(
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
  ): Promise<Node | string | null> {
    const route = this.route;
    const loader = ContentLoaderRegistry.create(route.source, this.loaderService);

    try {
      return await loader.load(route.content, {
        signal,
        componentOptions: buildComponentOptions(routeInfo),
      });
    } catch (error: unknown) {
      if (signal.aborted) return '';

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${loader.type} content for route ${route.path}: ${message}`);
    }
  }
}

function buildComponentOptions(routeInfo?: MatchedRouteInfo): Record<string, unknown> {
  if (!routeInfo) return {};

  return {
    href: routeInfo.href,
    pattern: routeInfo.pattern,
    ...(routeInfo.params && { params: routeInfo.params }),
    ...(routeInfo.query && { query: routeInfo.query }),
  };
}

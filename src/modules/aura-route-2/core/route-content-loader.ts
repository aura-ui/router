import { contentDescriptorFromRoute } from '../../aura-routing-engine/core/content/descriptor';
import type { ContentLoadService } from '../../aura-routing-engine/core/content/content-load-service';
import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { AuraRouteInterface } from './types';
import type { ContentResolverPort } from './view/ports';

/** Thin adapter: route attrs → shared {@link ContentLoadService}. */
export class RouteContentLoader implements ContentResolverPort {
  private readonly route: AuraRouteInterface;
  private readonly contentLoad: ContentLoadService;

  constructor(route: AuraRouteInterface, contentLoad: ContentLoadService) {
    this.route = route;
    this.contentLoad = contentLoad;
  }

  resolve(routeInfo: MatchedRouteInfo, signal: AbortSignal) {
    return this.contentLoad.resolve(contentDescriptorFromRoute(this.route), routeInfo, signal);
  }
}

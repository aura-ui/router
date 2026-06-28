import {
  buildContentDescriptor,
  type ContentLoadService,
  type MatchedRouteInfo,
} from '../../aura-routing-engine/route-api';

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
    return this.contentLoad.resolve(buildContentDescriptor(this.route), routeInfo, signal);
  }
}

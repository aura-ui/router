import type {
  MatchedRouteInfo,
  PreserveFlags,
  RouteTransition,
  ScrollPolicy,
} from '../../aura-routing-engine/route-api';

/** Public surface of `<aura-route>` attributes. */
export interface AuraRouteInterface {
  path: string;
  layout: string;
  view: string;
  loadingTemplate: string;
  errorTemplate: string;
  preserve: PreserveFlags;
  scrollPolicy: ScrollPolicy | null;
  readonly transition: RouteTransition;
}

export type RouteRenderOptions = {
  parentSignal?: AbortSignal;
};

export type { MatchedRouteInfo };

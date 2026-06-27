import type { MatchedRouteInfo } from '../../aura-routing-engine/core';
import type { PreserveFlags } from '../../aura-routing-engine/core/content/preserve';
import type { RouteTransition } from '../../aura-routing-engine/core/transition/route-transition';

/** Public surface of `<aura-route>` attributes. */
export interface AuraRouteInterface {
  path: string;
  layout: string;
  view: string;
  loadingTemplate: string;
  errorTemplate: string;
  preserve: PreserveFlags;
  restoreScroll: boolean;
  readonly transition: RouteTransition;
}

export type RouteRenderOptions = {
  parentSignal?: AbortSignal;
};

export type { MatchedRouteInfo };

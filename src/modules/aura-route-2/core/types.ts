import type { MatchedRouteInfo } from '../../aura-route-hooks/core';
import type { PreserveFlags } from '../../aura-routing-engine/core/content/preserve';

/** Public surface of `<aura-route-2>` attributes. */
export interface AuraRouteInterface {
  path: string;
  layout: string;
  view: string;
  loadingTemplate: string;
  errorTemplate: string;
  preserve: PreserveFlags;
  restoreScroll: boolean;
  /** Inherited `data-crossfade` — staged outlet mount (separate from engine transition policy). */
  crossfade: string;
}

export type RouteRenderOptions = {
  parentSignal?: AbortSignal;
};

export type { MatchedRouteInfo };

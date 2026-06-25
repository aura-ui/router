import type { MatchedRouteInfo } from '../../aura-route-hooks/core';

/** Public surface of `<aura-route-2>` attributes. */
export interface AuraRouteInterface {
  path: string;
  layout: string;
  source: string;
  content: string;
  loadingTemplate: string;
  errorTemplate: string;
  preload: boolean;
  keepAlive: boolean;
  restoreScroll: boolean;
  cache: boolean;
  /** Inherited `data-crossfade` — staged outlet mount (separate from engine transition policy). */
  crossfade: string;
}

export type RouteRenderOptions = {
  parentSignal?: AbortSignal;
};

export type { MatchedRouteInfo };

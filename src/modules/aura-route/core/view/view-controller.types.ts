import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';

export type RouteViewKind = 'layout' | 'content';

/** Options for one {@link AuraRouteViewController.render} pass. */
export type RouteRenderOptions = {
  /** Parent navigation signal; aborts render when the transition is superseded. */
  parentSignal?: AbortSignal;
};

/** Resolves route view HTML/DOM: layout template, loader, cache, preload. */
export interface RouteContentPort {
  resolve(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<Node | string | null>;
  preload?(signal: AbortSignal): Promise<void>;
  readCache?(routeInfo: MatchedRouteInfo): Node | string | null;
  writeCache?(routeInfo: MatchedRouteInfo, payload: Node | string): void;
}

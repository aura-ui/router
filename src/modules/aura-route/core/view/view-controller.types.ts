import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';

export type RouteViewKind = 'layout' | 'content';

export type RouteRenderOptions = {
  signal?: AbortSignal;
  /** Inherited from `<aura-router data-transition>`; omit/false → outlet `replace`. */
  stageMount?: boolean;
};

/** Resolves route payload: layout template, loader, cache, preload. */
export interface RouteContentPort {
  resolve(routeInfo: MatchedRouteInfo | undefined, signal: AbortSignal): Promise<Node | string | null>;
  preload?(signal: AbortSignal): Promise<void>;
  readCache?(routeInfo: MatchedRouteInfo | undefined): Node | string | null;
  writeCache?(routeInfo: MatchedRouteInfo, payload: Node | string): void;
}

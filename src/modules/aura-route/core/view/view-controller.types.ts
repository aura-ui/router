import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';

export type RouteViewKind = 'layout' | 'content';

export type RouteRenderOptions = {
  signal?: AbortSignal;
  /** Inherited from `<aura-router data-transition>`; omit/false → outlet `replace`. */
  stageMount?: boolean;
};

/** Static route view configuration (attrs), without HTMLElement coupling. */
export type RouteViewConfig = {
  path: string;
  layout?: string;
  keepAlive: boolean;
  loadingTemplate?: string;
  errorTemplate?: string;
};

/** Resolves route payload: layout template, loader, cache, preload. */
export interface RouteContentPort {
  resolve(routeInfo: MatchedRouteInfo | undefined, signal: AbortSignal): Promise<Node | string | null>;
  preload?(signal: AbortSignal): Promise<void>;
  readCache?(routeInfo: MatchedRouteInfo | undefined): Node | string | null;
  writeCache?(routeInfo: MatchedRouteInfo, payload: Node | string): void;
}

/** Outlet access for nested route trees. */
export interface RouteOutletPort {
  resolveRootOutlet: () => AuraOutlet;
  parentOutlet(routeInfo?: MatchedRouteInfo): AuraOutlet | null;
}

export type AuraRouteViewHost = {
  readonly path: string;
  readonly layout: string;
  readonly source: string;
  readonly content: string;
  readonly cache: boolean;
  readonly keepAlive: boolean;
  readonly loadingTemplate: string;
  readonly errorTemplate: string;
};

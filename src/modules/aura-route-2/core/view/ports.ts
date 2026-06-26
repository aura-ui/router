import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';
import type { AuraOutlet, ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import type { RenderPass } from './render-pass';

export type ViewKind = 'layout' | 'content';
export type ViewPayload = Node | string;

/** Async layout template / loader. */
export interface ContentResolverPort {
  resolve(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<ViewPayload | null>;
  prefetchContent(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void>;
}

/** Keep-alive detached DOM (`extract` checkout, `put` cache). */
export interface ViewCachePort {
  extract(key: string): ViewRoot | undefined;
  put(key: string, root: ViewRoot): void;
}

/** Where to mount: app root + per-navigation nested slot. */
export interface MountTargetPort {
  appOutlet(): AuraOutlet;
  /** Parent layout slot; `null` → {@link MountTargetPort.appOutlet}. */
  nestedOutlet(routeInfo: MatchedRouteInfo): AuraOutlet | null;
}

export interface ViewRenderPlugin {
  onPassStart?(pass: RenderPass): void;
  onPassEnd?(pass: RenderPass): void;
  onContentResolved?(pass: RenderPass, payload: ViewPayload): void;
  onMounted?(pass: RenderPass): void;
  onPassError?(pass: RenderPass, error: unknown): void;
}

export type RouteViewConfig = {
  route: import('../types').AuraRouteInterface;
  content: ContentResolverPort;
  cache: ViewCachePort;
  mountTarget: MountTargetPort;
  plugins?: readonly ViewRenderPlugin[];
};

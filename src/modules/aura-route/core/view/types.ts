import type { MatchedRouteInfo } from '../../../aura-routing-engine/route-api';
import type { AuraOutlet, ViewRoot } from '../../../aura-outlet/core/aura-outlet';

export type ViewKind = 'layout' | 'content';
export type ViewPayload = Node | string;

/** Immutable snapshot for one view render attempt. */
export type RenderPass = {
  readonly id: number;
  readonly routeInfo: MatchedRouteInfo;
  readonly signal: AbortSignal;
  readonly cacheKey: string;
  readonly viewKind: ViewKind;
  readonly useStagedMount: boolean;
  /** Load-hook payload from DataGraph snapshot. */
  readonly data?: unknown;
  /**
   * Pre-fetched view payload from branch resolve.
   * When set, skips {@link ContentResolverPort.resolve} and mounts directly.
   */
  readonly preResolvedContent?: ViewPayload | null;
};

export interface ViewRenderPlugin {
  onLoadingStart?(pass: RenderPass): void;
  onLoadingEnd?(pass: RenderPass): void;
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

/** Keep-alive detached DOM (`extract` checkout, `put` cache). */
export interface ViewCachePort {
  extract(key: string): ViewRoot | undefined;
  put(key: string, root: ViewRoot): void;
}

/** Async layout template / loader. */
export interface ContentResolverPort {
  resolve(
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    options?: { data?: unknown },
  ): Promise<ViewPayload | null>;
}

/** Where to mount: app root + per-navigation nested slot. */
export interface MountTargetPort {
  appOutlet(): AuraOutlet;
  /** Parent layout slot; `null` → {@link MountTargetPort.appOutlet}. */
  nestedOutlet(routeInfo: MatchedRouteInfo): AuraOutlet | null;
}
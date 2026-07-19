import type { MatchedRouteInfo } from '../../../aura-routing-engine/route-api';
import type { AuraOutlet, ViewRoot } from '../../../aura-outlet/core/aura-outlet';

export type ViewKind = 'layout' | 'view';
export type ViewPayload = Node | string;

/** Immutable snapshot for one view render attempt. */
export type RenderPass = {
  readonly id: number;
  readonly routeInfo: MatchedRouteInfo;
  readonly signal: AbortSignal;
  readonly domCacheKey: string;
  readonly viewKind: ViewKind;
  readonly useStagedMount: boolean;
  /** Load-hook payload from DataGraph snapshot. */
  readonly data?: unknown;
  /**
   * When set, skips {@link ViewResolverPort.loadView} and mounts directly.
   */
  readonly preResolvedView?: ViewPayload | null;
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
  view: ViewResolverPort;
  cache: DomCachePort;
  mountTarget: MountTargetPort;
  plugins?: readonly ViewRenderPlugin[];
};

/** Keep-alive detached DOM (`extract` checkout, `put` cache). */
export interface DomCachePort {
  extract(key: string): ViewRoot | undefined;
  put(key: string, root: ViewRoot): void;
}

/** Outcome of one view/layout resolve — same shape as engine ViewGraph / DataGraph. */
export type ViewResolveResult = {
  data?: ViewPayload | null;
  error?: { status: 'cancelled' } | { status: string; [key: string]: unknown };
};

/** Async layout template / view loader. */
export interface ViewResolverPort {
  loadView(
    routeInfo: MatchedRouteInfo,
    signal: AbortSignal,
    options?: { data?: unknown },
  ): Promise<ViewResolveResult>;
}

/** Where to mount: app root + per-navigation nested slot. */
export interface MountTargetPort {
  appOutlet(): AuraOutlet;
  /** Parent layout slot; `null` → {@link MountTargetPort.appOutlet}. */
  nestedOutlet(routeInfo: MatchedRouteInfo): AuraOutlet | null;
}

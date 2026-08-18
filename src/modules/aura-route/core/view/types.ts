import type { AuraOutlet, ViewRoot } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo } from '../../../aura-routing-engine/route-api';

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
  /** Read-only probe — does not promote LRU or remove the entry. */
  has(key: string): boolean;
  extract(key: string): ViewRoot | undefined;
  put(key: string, root: ViewRoot): void;
}

/** Outcome of one view/layout resolve — success field is `payload` (ViewGraph), not DataGraph `data`. */
export type ViewResolveResult = {
  payload?: ViewPayload | null;
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

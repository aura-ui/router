import type { MatchedRouteInfo, CacheFlags } from '../../aura-routing-engine/route-api';

import type { ScrollAttr } from './attr/scroll-attr-parser';
import type { RouteTransitionType } from './attr/transition-attr-parser';
import type { ViewAttrDescriptor } from './attr/view-attr-parser';
import type { ViewPayload } from './view/types';

export type RouteType = 'page' | 'folder' | 'redirect';

/** Public surface of `<aura-route>` attributes. */
export interface AuraRouteInterface {
  path: string;
  layout: string;
  redirect: string;
  view: ViewAttrDescriptor | null;
  loadingTemplate: string | null;
  loadingBodyClass: string | null;
  loadingStartEvent: string | null;
  loadingEndEvent: string | null;
  errorTemplate: string | null;
  cache: CacheFlags;
  scrollPolicy: ScrollAttr | null;
  extract: string | null;
  readonly type: RouteType;
  readonly transition: RouteTransitionType;
  readonly hasLayout: boolean;
  readonly hasViewContent: boolean;
  readonly hasGuard: boolean;
  readonly hasLeave: boolean;
  readonly hasLoad: boolean;
  readonly hasTransitionIn: boolean;
  readonly hasReady: boolean;
  readonly hasAsyncContent: boolean;
  readonly hasSyncContent: boolean;
}

export type RouteRenderOptions = {
  parentSignal?: AbortSignal;
  /** Load-hook payload from DataGraph snapshot for this navigation. */
  data?: unknown;
  /** Synthetic param remount on the same `<aura-route>` leaf. */
  paramChangeRemount?: boolean;
};

/** Options for sync branch-atomic mount ({@link RouteViewController.mountResolvedView}). */
export type MountResolvedViewOptions = RouteRenderOptions & {
  /** Payload from navigation `viewSnapshot`. `null` = empty view route. */
  preResolvedView: ViewPayload | null;
  /** Force visible replace mount (loading placeholder before prepare). */
  immediate?: boolean;
};

export type RouteUnmountOptions = {
  /** DomCache key for detached outgoing DOM (exit route slice from unmount phase). */
  domCacheKey?: string;
};

export type { MatchedRouteInfo };

import type { MatchedRouteInfo, CacheFlags } from '../../aura-routing-engine/route-api';

import type { ScrollAttr } from './attr/scroll-attr-parser';

import type { RouteTransitionType } from './attr/transition-attr-parser';
import type { ViewAttrDescriptor } from './attr/view-attr-parser';
import type { ViewPayload } from './view/types';

/** Public surface of `<aura-route>` attributes. */
export interface AuraRouteInterface {
  path: string;
  layout: string;
  view: ViewAttrDescriptor | null;
  loadingTemplate: string;
  errorTemplate: string;
  cache: CacheFlags;
  scrollPolicy: ScrollAttr | null;
  extract: string | null;
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

/** Options for sync branch-atomic mount ({@link RouteViewController.applyPreResolved}). */
export type ApplyPreResolvedOptions = RouteRenderOptions & {
  /** Pre-fetched payload from branch resolve. `null` = empty content route. */
  preResolvedContent: ViewPayload | null;
};

export type RouteUnmountOptions = {
  /** DomCache key for detached outgoing DOM (exit route slice from unmount phase). */
  domCacheKey?: string;
};

export type { MatchedRouteInfo };

import type { MatchedRouteInfo, PreserveFlags } from '../../aura-routing-engine/route-api';

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
  preserve: PreserveFlags;
  scrollPolicy: ScrollAttr | null;
  readonly transition: RouteTransitionType;
  readonly hasLayout: boolean;
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
  /**
   * Pre-fetched view payload from branch resolve.
   * When set, skips {@link ContentResolverPort.resolve} and mounts directly.
   * `null` means an empty content route.
   */
  preResolvedContent?: ViewPayload | null;
};

export type RouteUnmountOptions = {
  /** ViewCache key for detached outgoing DOM (exit route slice from unmount phase). */
  cacheKey?: string;
};

export type { MatchedRouteInfo };

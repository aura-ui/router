import type { MatchedRouteInfo, CacheFlags } from '../../aura-routing-engine/route-api';

import type { ScrollAttr } from './attr/scroll-attr-parser';
import type { ScrollBehaviorAttr } from './attr/scroll-behavior-attr-parser';

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
  /** `cache-time` — per-entry `gcTime` ms; `null` → store default. */
  cacheTime: number | null;
  /** `cache-refresh` — per-entry `staleTime` ms; `null` → store default. */
  cacheRefresh: number | null;
  scrollPolicy: ScrollAttr | null;
  /** `scroll-target` — CSS selector; `null` → top / restore only. */
  scrollTarget: string | null;
  /** `scroll-behavior` — native smooth | instant | auto. */
  scrollBehavior: ScrollBehaviorAttr | null;
  extract: string | null;
  /** `meta-title` — document title (`:param` tokens); `null` → extracted HTML meta fallback / unchanged. */
  metaTitle: string | null;
  /** `meta-title-template` — wraps the page title (`%s`); `null` → no wrap. */
  metaTitleTemplate: string | null;
  /** `meta-description` — description meta (`:param` tokens); `null` → extracted HTML meta fallback / unchanged. */
  metaDescription: string | null;
  /** `meta-canonical` — canonical link href (`:param` tokens); `null` → extracted HTML meta fallback / unchanged. */
  metaCanonical: string | null;
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
};

export type RouteUnmountOptions = {
  /** DomCache key for detached outgoing DOM (exit route slice from unmount phase). */
  domCacheKey?: string;
};

export type { MatchedRouteInfo };

import type {
  MatchedRouteInfo,
  PreserveFlags,
  ScrollPolicy,
} from '../../aura-routing-engine/route-api';

import type { RouteTransitionType } from './attr/transition-attr-parser';
import type { ViewAttrDescriptor } from './attr/view-attr-parser';

/** Public surface of `<aura-route>` attributes. */
export interface AuraRouteInterface {
  path: string;
  layout: string;
  view: ViewAttrDescriptor | null;
  loadingTemplate: string;
  errorTemplate: string;
  preserve: PreserveFlags;
  scrollPolicy: ScrollPolicy | null;
  readonly transition: RouteTransitionType;
  readonly hasLayout: boolean;
  readonly hasEnter: boolean;
  readonly hasLeave: boolean;
  readonly hasLoad: boolean;
  readonly hasTransitionIn: boolean;
  readonly hasPostEffects: boolean;
  readonly hasAsyncContent: boolean;
  readonly hasSyncContent: boolean;
}

export type RouteRenderOptions = {
  parentSignal?: AbortSignal;
  /** Load-hook payload from DataGraph snapshot for this navigation. */
  data?: unknown;
};

export type { MatchedRouteInfo };

import type { MatchedRouteInfo } from '../match/url-matcher';

export type NavigationErrorPhase =
  | 'leave'
  | 'enter'
  | 'load'
  | 'reenter'
  | 'render'
  | 'transitionOut'
  | 'transitionIn'
  | 'left'
  | 'entered';

export interface NavigationErrorDetail {
  error: unknown;
  url: string;
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  phase: NavigationErrorPhase;
  /** True when the error occurred after view commit (`runRender`). */
  viewCommitted: boolean;
}

import type { MatchedRouteInfo } from './aura-routing-url-matcher';

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
  committed: boolean;
}

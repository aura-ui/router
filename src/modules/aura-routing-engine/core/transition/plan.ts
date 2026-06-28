import type { MatchedRouteInfo } from '../match/url-matcher';

export interface TransitionMap {
  exitRoutes: MatchedRouteInfo[];
  enterRoutes: MatchedRouteInfo[];
  lca: MatchedRouteInfo | null;
  reenter: boolean;
}

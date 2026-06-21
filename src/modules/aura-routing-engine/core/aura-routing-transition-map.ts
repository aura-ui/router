import type { MatchedRouteInfo } from './aura-routing-url-matcher';
import { buildTreeRoadMap } from './nodes-tree';

export interface TransitionMap {
  exitRoutes: MatchedRouteInfo[];
  enterRoutes: MatchedRouteInfo[];
  lca: MatchedRouteInfo | null;
  reenter: boolean;
}

export function buildRoadMap(from: MatchedRouteInfo | null, to: MatchedRouteInfo): TransitionMap {
  return buildTreeRoadMap(from, to);
}

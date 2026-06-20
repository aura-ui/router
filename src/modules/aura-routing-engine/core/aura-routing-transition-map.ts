import type { MatchedRouteInfo } from './aura-routing-url-matcher';

export interface TransitionMap {
  exitRoutes: MatchedRouteInfo[];
  enterRoutes: MatchedRouteInfo[];
  lca: MatchedRouteInfo | null;
  reentered: boolean;
}

// простая реализация сейчас
// для вложенных маршрутов будем строить дерево, проходить его и заполнять
export function buildRoadMap(from: MatchedRouteInfo | null, to: MatchedRouteInfo): TransitionMap {

  if (!from) {
    return { exitRoutes: [], enterRoutes: [to], lca: null, reentered: false };
  }

  const reentered = from.pathname === to.pathname && from.search === to.search;

  if (reentered) {
    return { exitRoutes: [], enterRoutes: [to], lca: to, reentered: true };
  }

  return { exitRoutes: [from], enterRoutes: [to], lca: null, reentered: false };
}

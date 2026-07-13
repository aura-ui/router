import type { MatchedRouteInfo } from '../match/url-matcher';

export interface RouteTrailEntry {
  pattern: string;
  href: string;
}

export function toRouteTrail(chain: readonly MatchedRouteInfo[]): RouteTrailEntry[] {
  return chain.map((e) => ({ pattern: e.pattern, href: e.href }));
}

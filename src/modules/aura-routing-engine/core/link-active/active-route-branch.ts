import type { MatchedRouteInfo } from '../match/url-matcher';

export interface ActiveRouteBranchEntry {
  pattern: string;
  href: string;
}

export function toActiveRouteBranch(chain: readonly MatchedRouteInfo[]): ActiveRouteBranchEntry[] {
  return chain.map((e) => ({ pattern: e.pattern, href: e.href }));
}

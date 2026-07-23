import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { attachResolvedView } from '../../core/route-tree/resolved-view';

/** Mirrors {@link buildActiveChain} for hand-built match fixtures. */
export function withResolvedView(info: MatchedRouteInfo): MatchedRouteInfo {
  attachResolvedView(info);
  return info;
}

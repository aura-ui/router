import { resolveHookNames } from '../lifecycle/bindings/route-hook-bindings';
import type { MatchedRouteInfo } from '../match/url-matcher';
import { getLeafMatch } from '../route-tree/matched-chain';

/** Whether the target route declares work for the processor reenter shortcut. */
export function hasReenterWork(to: MatchedRouteInfo): boolean {
  const hooks = resolveHookNames(getLeafMatch(to).route, 'reenter');
  return !!hooks?.length;
}

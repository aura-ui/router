import type { MatchedRouteInfo } from '../../../aura-routing-engine/route-api';

/** Minimal {@link MatchedRouteInfo} stub for view / render tests (cast — no real route tree). */
export function createMatchedRouteInfo(
  pathname: string,
  overrides: Partial<MatchedRouteInfo> = {},
): MatchedRouteInfo {
  return {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: pathname,
    ...overrides,
  } as MatchedRouteInfo;
}

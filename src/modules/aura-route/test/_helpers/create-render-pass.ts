import type { RenderPass } from '../../core/view/types';

import { createMatchedRouteInfo } from './create-matched-route-info';

/** Minimal {@link RenderPass} for pipeline / plugin tests. */
export function createRenderPass(
  overrides: Partial<RenderPass> & { pathname?: string } = {},
): RenderPass {
  const pathname = overrides.pathname ?? overrides.routeInfo?.pathname ?? '/page';
  const { pathname: _pathname, ...rest } = overrides;

  return {
    id: 1,
    routeInfo: createMatchedRouteInfo(pathname),
    signal: new AbortController().signal,
    domCacheKey: pathname,
    viewKind: 'view',
    useStagedMount: false,
    ...rest,
  };
}

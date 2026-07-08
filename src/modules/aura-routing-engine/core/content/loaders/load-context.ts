import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { ContentDescriptor, LoadContext } from '../model/types';

export function toLoadContext(
  routeInfo: MatchedRouteInfo,
  source: Pick<ContentDescriptor, 'ref' | 'extract'>,
  signal: AbortSignal,
  data?: unknown,
): LoadContext {
  return {
    ref: source.ref,
    signal,
    route: {
      href: routeInfo.href,
      pattern: routeInfo.pattern,
      ...(routeInfo.params && { params: routeInfo.params }),
      ...(routeInfo.query && { query: routeInfo.query }),
    },
    ...(data !== undefined && { data }),
    ...(source.extract && { extract: source.extract }),
  };
}

/** Route + load payload passed into component custom elements via `aura-data`. */
export function routeSnapshot(ctx: LoadContext): Record<string, unknown> {
  return {
    href: ctx.route.href,
    pattern: ctx.route.pattern,
    ...(ctx.route.params && { params: ctx.route.params }),
    ...(ctx.route.query && { query: ctx.route.query }),
    ...(ctx.data !== undefined && { data: ctx.data }),
  };
}

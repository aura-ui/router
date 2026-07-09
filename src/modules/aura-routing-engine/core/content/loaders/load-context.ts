import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { LoadContext } from '../model/types';

export function toLoadContext(
  routeInfo: MatchedRouteInfo,
  content: string,
  signal: AbortSignal,
  data?: unknown,
): LoadContext {
  return {
    content,
    signal,
    route: {
      href: routeInfo.href,
      pattern: routeInfo.pattern,
      ...(routeInfo.params && { params: routeInfo.params }),
      ...(routeInfo.query && { query: routeInfo.query }),
    },
    ...(data !== undefined && { data }),
  };
}

export function routeSnapshot(ctx: LoadContext): Record<string, unknown> {
  return {
    href: ctx.route.href,
    pattern: ctx.route.pattern,
    ...(ctx.route.params && { params: ctx.route.params }),
    ...(ctx.route.query && { query: ctx.route.query }),
    ...(ctx.data !== undefined && { data: ctx.data }),
  };
}

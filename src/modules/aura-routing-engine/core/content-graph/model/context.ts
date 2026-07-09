import { escapeHtml } from '../../../../aura-utils/misc';
import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { ContentDescriptor, LoadContext } from './types';

export function toLoadContext(
  routeInfo: MatchedRouteInfo,
  descriptor: Pick<ContentDescriptor, 'kind' | 'ref' | 'extract'>,
  signal: AbortSignal,
  data?: unknown,
): LoadContext {
  return {
    ref: descriptor.ref,
    kind: descriptor.kind,
    signal,
    route: {
      href: routeInfo.href,
      pattern: routeInfo.pattern,
      ...(routeInfo.params && { params: routeInfo.params }),
      ...(routeInfo.query && { query: routeInfo.query }),
    },
    ...(data !== undefined && { data }),
    ...(descriptor.extract && { extract: descriptor.extract }),
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

export function componentMarkup(tagName: string, ctx: LoadContext): string {
  const dataAttr = escapeHtml(JSON.stringify(routeSnapshot(ctx)));
  return `<${tagName} aura-data='${dataAttr}'></${tagName}>`;
}

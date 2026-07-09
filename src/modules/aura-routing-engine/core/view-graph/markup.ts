import { escapeHtml } from '../../../aura-utils/misc';
import type { ViewLoadContext } from './types';

export function routeSnapshot(ctx: ViewLoadContext): Record<string, unknown> {
  return {
    href: ctx.route.href,
    pattern: ctx.route.pattern,
    ...(ctx.route.params && { params: ctx.route.params }),
    ...(ctx.route.query && { query: ctx.route.query }),
    ...(ctx.data !== undefined && { data: ctx.data }),
  };
}

export function componentMarkup(tagName: string, context: ViewLoadContext): string {
  const dataAttr = escapeHtml(JSON.stringify(routeSnapshot(context)));
  return `<${tagName} aura-data='${dataAttr}'></${tagName}>`;
}

import { escapeHtml } from '../../../aura-utils/misc';

import type { ViewLoadContext } from './types';

/** Route + optional load-hook data for `aura-data` on component loaders. */
export function routeSnapshot(ctx: ViewLoadContext): Record<string, unknown> {
  return {
    href: ctx.route.href,
    pattern: ctx.route.pattern,
    ...(ctx.route.params && { params: ctx.route.params }),
    ...(ctx.route.query && { query: ctx.route.query }),
    ...(ctx.data !== undefined && { data: ctx.data }),
  };
}

/** Autonomous custom element tag — lowercase alphanumerics, `.`, `_`, `-`. */
export const CUSTOM_ELEMENT_TAG_RE = /^[a-z][a-z0-9._-]*$/;

/** `<tag aura-data='{…}'></tag>` for component / import loaders. */
export function componentMarkup(tagName: string, context: ViewLoadContext): string {
  if (!CUSTOM_ELEMENT_TAG_RE.test(tagName)) {
    throw new Error(`Invalid custom element tag name: "${tagName}"`);
  }
  const dataAttr = escapeHtml(JSON.stringify(routeSnapshot(context)));
  return `<${tagName} aura-data='${dataAttr}'></${tagName}>`;
}

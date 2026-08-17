import type { MatchedRouteInfo } from '../match/url-matcher';
import { substituteTokens } from '../route-tree/resolve-view-content';
import type { DocumentHeadValues } from './types';

/** True when at least one head field is present (rejects `{}` / empty strings). */
export function hasDocumentHead(head: DocumentHeadValues | null | undefined): head is DocumentHeadValues {
  if (!head) return false;
  return Object.values(head).some(Boolean);
}

/**
 * Bind match params/query into `meta-title` / `meta-description`, overlay on htmlHead.
 * `meta-title-template` wraps the page title (`%s`). Canonical and other HTML fields pass through.
 * Empty → `null`.
 *
 * `:name` only (path wins over query). `?` is literal — not view-search syntax.
 */
export function resolveDocumentHeadWithParams(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): DocumentHeadValues | null {
  const { metaTitle, metaDescription, metaTitleTemplate } = to.route;
  if (metaTitle == null && metaDescription == null && metaTitleTemplate == null) {
    return hasDocumentHead(htmlHead) ? htmlHead : null;
  }

  const vars = { ...to.query, ...to.params };
  const head: DocumentHeadValues = { ...htmlHead };
  if (metaDescription != null) head.description = substituteTokens(metaDescription, vars);

  const title = resolveTitle(to.route, htmlHead?.title, vars);
  if (title !== undefined) head.title = title;

  return hasDocumentHead(head) ? head : null;
}

/**
 * 1. Page title = local `meta-title` or HTML `<title>` (inherited attr is not a page title).
 * 2. Template + page title → wrap `%s`. Otherwise attr (local or inherited) or HTML.
 */
function resolveTitle(route: MatchedRouteInfo['route'], htmlTitle: string | undefined, vars: Record<string, string>): string | undefined {
  const { metaTitle, metaTitleTemplate } = route;
  const attrTitle = metaTitle != null ? substituteTokens(metaTitle, vars) : null;
  const hasLocalTitle = route.hasAttribute('meta-title');
  const pageTitle = hasLocalTitle && attrTitle != null ? attrTitle : htmlTitle;

  if (metaTitleTemplate != null && pageTitle) {
    const template = substituteTokens(metaTitleTemplate, vars);
    return template.includes('%s') ? template.split('%s').join(pageTitle) : pageTitle;
  }

  return attrTitle ?? htmlTitle;
}

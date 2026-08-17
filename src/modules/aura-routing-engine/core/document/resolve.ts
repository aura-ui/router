import type { MatchedRouteInfo } from '../match/url-matcher';
import { substituteTokens } from '../route-tree/resolve-view-content';
import { CANONICAL_ID, META_DESCRIPTION_ID } from './schema';
import type { DocumentHeadValues } from './types';

/** True when title, html attrs, or at least one tag is set. */
export function hasDocumentHead(head: DocumentHeadValues | null | undefined): head is DocumentHeadValues {
  if (!head) return false;
  if (head.title || head.lang || head.dir) return true;
  return Object.values(head.tags ?? {}).some(Boolean);
}

/**
 * Bind match params/query into route meta attrs, overlay on htmlHead.
 * `meta-title-template` wraps the page title (`%s`). Empty → `null`.
 *
 * `:name` only (path wins over query). `?` is literal — not view-search syntax.
 */
export function resolveDocumentHeadWithParams(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): DocumentHeadValues | null {
  const { metaTitle, metaDescription, metaTitleTemplate, metaCanonical } = to.route;
  if (
    metaTitle == null &&
    metaDescription == null &&
    metaTitleTemplate == null &&
    metaCanonical == null
  ) {
    return hasDocumentHead(htmlHead) ? htmlHead : null;
  }

  const vars = { ...to.query, ...to.params };
  const head: DocumentHeadValues = { ...htmlHead };
  if (metaDescription != null) {
    head.tags = { ...head.tags, [META_DESCRIPTION_ID]: substituteTokens(metaDescription, vars) };
  }
  if (metaCanonical != null) {
    head.tags = { ...head.tags, [CANONICAL_ID]: substituteTokens(metaCanonical, vars) };
  }

  const title = resolveTitle(to.route, htmlHead?.title, vars);
  if (title !== undefined) head.title = title;

  return hasDocumentHead(head) ? head : null;
}

/**
 * 1. Local `meta-title` or HTML `<title>` (inherited attr is not this).
 * 2. Template + that title → wrap `%s`. Otherwise attr (local or inherited) or HTML.
 */
function resolveTitle(route: MatchedRouteInfo['route'], htmlTitle: string | undefined, vars: Record<string, string>): string | undefined {
  const { metaTitle, metaTitleTemplate } = route;
  const attrTitle = metaTitle != null ? substituteTokens(metaTitle, vars) : null;
  const hasLocalTitle = route.hasAttribute('meta-title');
  const localOrHtmlTitle = hasLocalTitle && attrTitle != null ? attrTitle : htmlTitle;

  if (metaTitleTemplate != null && localOrHtmlTitle) {
    const template = substituteTokens(metaTitleTemplate, vars);
    return template.includes('%s') ? template.split('%s').join(localOrHtmlTitle) : localOrHtmlTitle;
  }

  return attrTitle ?? htmlTitle;
}

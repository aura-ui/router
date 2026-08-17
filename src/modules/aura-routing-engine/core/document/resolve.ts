import type { MatchedRouteInfo } from '../match/url-matcher';
import { substituteTokens } from '../route-tree/resolve-view-content';
import { CANONICAL_ID, META_DESCRIPTION_ID } from './schema';
import { hasDocumentMeta, type DocumentMetaValues } from './types';

/**
 * Bind match params/query into route meta attrs, overlay on htmlMeta.
 * `meta-title-template` wraps the page title (`%s`). Empty → `null`.
 *
 * `:name` only (path wins over query). `?` is literal — not view-search syntax.
 */
export function resolveDocumentMetaWithParams(
  to: MatchedRouteInfo,
  htmlMeta?: DocumentMetaValues,
): DocumentMetaValues | null {
  const { metaTitle, metaDescription, metaTitleTemplate, metaCanonical } = to.route;
  if (
    metaTitle == null &&
    metaDescription == null &&
    metaTitleTemplate == null &&
    metaCanonical == null
  ) {
    return hasDocumentMeta(htmlMeta) ? htmlMeta : null;
  }

  const vars = { ...to.query, ...to.params };
  const meta: DocumentMetaValues = { ...htmlMeta };
  if (metaDescription != null) {
    meta.tags = { ...meta.tags, [META_DESCRIPTION_ID]: substituteTokens(metaDescription, vars) };
  }
  if (metaCanonical != null) {
    meta.tags = { ...meta.tags, [CANONICAL_ID]: substituteTokens(metaCanonical, vars) };
  }

  const title = resolveTitle(to.route, htmlMeta?.title, vars);
  if (title !== undefined) meta.title = title;

  return hasDocumentMeta(meta) ? meta : null;
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

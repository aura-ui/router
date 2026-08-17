import type { MatchedRouteInfo } from '../match/url-matcher';
import { substituteTokens } from '../route-tree/resolve-view-content';
import { CANONICAL_ID, META_DESCRIPTION_ID } from './schema';
import { hasDocumentMeta, type DocumentMetaValues } from './types';

/**
 * Combine leaf `htmlMeta` with route meta attrs for the committed match.
 *
 * Route attrs (`meta-title`, `meta-description`, `meta-canonical`, `meta-title-template`)
 * overlay values from HTML when set on the matched route (including inherited attrs).
 *
 * When all four attrs are `null`, returns `htmlMeta` unchanged, or `null` if empty.
 *
 * Title rules:
 * - `meta-title-template` + page title → `%s` substitution (local `meta-title` or HTML `<title>`).
 * - Otherwise → inherited / attr `meta-title`, then HTML `<title>`.
 *
 * `lang` / `dir` pass through from `htmlMeta` only (no route attrs yet).
 * `:name` tokens in attrs: path params override query on the same key.
 *
 * @param to Committed leaf match (`to.route` carries inherited attrs).
 * @param htmlMeta Meta from the leaf url view; absent for non-url loaders.
 * @returns Meta ready for apply, or `null` when empty (host still reverts to boot state).
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
 * Resolve title for {@link resolveDocumentMetaWithParams}.
 *
 * Local `meta-title` (attribute on the route element) wins over HTML `<title>` for `%s`.
 * Inherited `meta-title` from an ancestor applies when the leaf has no local attr.
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

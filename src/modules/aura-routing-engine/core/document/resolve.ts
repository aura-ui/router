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
 * Canonical and other HTML fields pass through. Empty → `null`.
 *
 * `:name` only (path wins over query). `?` is literal — not view-search syntax.
 */
export function resolveDocumentHeadWithParams(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): DocumentHeadValues | null {
  const { metaTitle, metaDescription } = to.route;
  if (metaTitle == null && metaDescription == null) {
    return hasDocumentHead(htmlHead) ? htmlHead : null;
  }

  const vars = { ...to.query, ...to.params };
  const head: DocumentHeadValues = { ...htmlHead };
  if (metaTitle != null) head.title = substituteTokens(metaTitle, vars);
  if (metaDescription != null) head.description = substituteTokens(metaDescription, vars);
  return hasDocumentHead(head) ? head : null;
}

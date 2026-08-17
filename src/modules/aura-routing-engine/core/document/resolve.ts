import type { MatchedRouteInfo } from '../match/url-matcher';
import { resolveViewContent } from '../route-tree/resolve-view-content';
import type { DocumentHeadValues } from './types';

/** True when at least one head field is present (rejects `{}` / empty strings). */
export function hasDocumentHead(head: DocumentHeadValues | null | undefined): head is DocumentHeadValues {
  if (!head) return false;
  return Object.values(head).some(Boolean);
}

/**
 * Resolve leaf document head for a navigation.
 * Attrs (`meta-title` / `meta-description`, `:param` tokens) →
 * HTML head from this navigation's load / view-cache → none.
 */
export function resolveDocumentHead(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): DocumentHeadValues | null {
  const vars = { params: to.params, query: to.query };

  const title =
    to.route.metaTitle != null
      ? resolveViewContent(to.route.metaTitle, vars)
      : htmlHead?.title;
  const description =
    to.route.metaDescription != null
      ? resolveViewContent(to.route.metaDescription, vars)
      : htmlHead?.description;

  const head: DocumentHeadValues = {
    ...htmlHead,
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
  };
  return hasDocumentHead(head) ? head : null;
}

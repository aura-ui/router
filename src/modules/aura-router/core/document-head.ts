import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { resolveDocumentHeadWithParams, type DocumentHeadValues } from '../../aura-routing-engine/core/document';

/** Marks description/canonical this apply wrote. Next omit removes only those. */
const OWNED = 'data-aura-head';

let bootTitle: string | undefined;

/** Sync live `document` head after view commit. */
export function applyDocumentHead(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): void {
  const head = resolveDocumentHeadWithParams(to, htmlHead);

  bootTitle ??= document.title;
  if (head?.title !== undefined) document.title = head.title;
  else document.title = bootTitle;

  const description = head?.description;
  if (description !== undefined) {
    const el = document.head.querySelector('meta[name="description"]') ?? document.head.appendChild(document.createElement('meta'));
    el.setAttribute('name', 'description');
    el.setAttribute('content', description);
    el.setAttribute(OWNED, '');
  } else {
    document.head.querySelector(`meta[name="description"][${OWNED}]`)?.remove();
  }

  const canonical = head?.canonical;
  if (canonical !== undefined) {
    const el = document.head.querySelector('link[rel="canonical"]') ?? document.head.appendChild(document.createElement('link'));
    el.setAttribute('rel', 'canonical');
    el.setAttribute('href', canonical);
    el.setAttribute(OWNED, '');
  } else {
    document.head.querySelector(`link[rel="canonical"][${OWNED}]`)?.remove();
  }
}

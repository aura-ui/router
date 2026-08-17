import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { resolveDocumentHeadWithParams, type DocumentHeadValues } from '../../aura-routing-engine/core/document';

/** Sync live `document` head after view commit. No-op when nothing to apply. */
export function applyDocumentHead(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): void {
  const head = resolveDocumentHeadWithParams(to, htmlHead);
  if (!head) return;

  if (head.title !== undefined) document.title = head.title;

  if (head.description !== undefined) {
    const el = document.head.querySelector('meta[name="description"]') ?? document.head.appendChild(document.createElement('meta'));
    el.setAttribute('name', 'description');
    el.setAttribute('content', head.description);
  }

  if (head.canonical !== undefined) {
    const el = document.head.querySelector('link[rel="canonical"]') ?? document.head.appendChild(document.createElement('link'));
    el.setAttribute('rel', 'canonical');
    el.setAttribute('href', head.canonical);
  }
}

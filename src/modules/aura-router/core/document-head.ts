import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { resolveDocumentHeadWithParams, type DocumentHeadValues } from '../../aura-routing-engine/core/document';

/** Sync live `document` head after view commit. No-op when nothing to apply. */
export function applyDocumentHead(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): void {
  const head = resolveDocumentHeadWithParams(to, htmlHead);
  if (!head) return;

  if (head.title !== undefined) document.title = head.title;

  if (head.description !== undefined) {
    let el = document.querySelector('meta[name="description"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'description');
      document.head.appendChild(el);
    }
    el.setAttribute('content', head.description);
  }

  if (head.canonical !== undefined) {
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', head.canonical);
  }
}

import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { resolveDocumentHeadWithParams, type DocumentHeadValues } from '../../aura-routing-engine/core/document';
import { headTags, type HeadTagSpec } from '../../aura-routing-engine/core/document/schema';

/** Marks tags this apply wrote. Next omit removes only those. */
const OWNED = 'data-aura-head';

let bootTitle: string | undefined;

/** Sync live `document` head after view commit. */
export function applyDocumentHead(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): void {
  const head = resolveDocumentHeadWithParams(to, htmlHead);

  bootTitle ??= document.title;
  if (head?.title !== undefined) document.title = head.title;
  else document.title = bootTitle;

  for (const spec of headTags) {
    syncOwnedTag(spec, head?.tags?.[spec.id]);
  }
}

function syncOwnedTag(spec: HeadTagSpec, value: string | undefined): void {
  if (value === undefined) {
    document.head.querySelector(`${spec.selector}[${OWNED}]`)?.remove();
    return;
  }

  const el =
    document.head.querySelector(spec.selector) ?? document.head.appendChild(document.createElement(spec.tag));
  for (const [name, attrValue] of Object.entries(spec.attrs)) el.setAttribute(name, attrValue);
  el.setAttribute(spec.valueAttr, value);
  el.setAttribute(OWNED, '');
}

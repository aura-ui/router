import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { resolveDocumentHeadWithParams, type DocumentHeadValues } from '../../aura-routing-engine/core/document';
import { getHeadTags, type HeadTagSpec } from '../../aura-routing-engine/core/document/schema';

/** Marks tags this apply wrote. Next omit removes only those. */
const OWNED = 'data-aura-head';

let bootTitle: string | undefined;
let bootLang: string | undefined;
let bootDir: string | undefined;

/** Sync live `document` head after view commit. */
export function applyDocumentHead(to: MatchedRouteInfo, htmlHead?: DocumentHeadValues): void {
  const resolved = resolveDocumentHeadWithParams(to, htmlHead);

  bootTitle ??= document.title;
  if (resolved?.title !== undefined) document.title = resolved.title;
  else document.title = bootTitle;

  bootLang ??= document.documentElement.getAttribute('lang') ?? '';
  bootDir ??= document.documentElement.getAttribute('dir') ?? '';
  syncHtmlAttr('lang', resolved?.lang, bootLang);
  syncHtmlAttr('dir', resolved?.dir, bootDir);

  for (const spec of getHeadTags()) {
    syncOwnedTag(spec, resolved?.tags?.[spec.id]);
  }
}

function syncHtmlAttr(name: 'lang' | 'dir', value: string | undefined, boot: string): void {
  const next = value !== undefined ? value : boot;
  if (next) document.documentElement.setAttribute(name, next);
  else document.documentElement.removeAttribute(name);
}

function syncOwnedTag(spec: HeadTagSpec, value: string | undefined): void {
  if (value === undefined) {
    document.head.querySelector(`${spec.selector}[${OWNED}]`)?.remove();
    return;
  }

  const el =
    document.head.querySelector(spec.selector) ?? document.head.appendChild(document.createElement(spec.tag));
  for (const [attr, attrValue] of Object.entries(spec.attrs)) el.setAttribute(attr, attrValue);
  el.setAttribute(spec.valueAttr, value);
  el.setAttribute(OWNED, '');
}

import { getHeadTags, type DocumentMetaValues, type HeadTagSpec } from '../../aura-routing-engine/core/document';

/** Marker on tags written by apply — only marked tags are removed on omit. */
const OWNED = 'data-aura-head';

let bootTitle: string | undefined;
let bootLang: string | undefined;
let bootDir: string | undefined;

/**
 * Write resolved meta to the live document after view commit.
 *
 * Updates `document.title`, `<html lang|dir>`, and managed `<head>` tags.
 * Tags this function creates are marked `data-aura-head`; on omit they are removed
 * and title/lang/dir revert to values captured before the first apply (boot state).
 */
export function applyDocumentMeta(resolved: DocumentMetaValues | null): void {
  bootTitle ??= document.title;
  if (resolved?.title !== undefined) document.title = resolved.title;
  else document.title = bootTitle;

  bootLang ??= document.documentElement.getAttribute('lang') ?? '';
  bootDir ??= document.documentElement.getAttribute('dir') ?? '';
  syncRootAttr('lang', resolved?.lang, bootLang);
  syncRootAttr('dir', resolved?.dir, bootDir);

  for (const spec of getHeadTags()) {
    syncHeadTag(spec, resolved?.tags?.[spec.id]);
  }
}

/** Write or revert a root attribute (`lang` / `dir`) against boot snapshot. */
function syncRootAttr(name: 'lang' | 'dir', value: string | undefined, boot: string): void {
  const next = value !== undefined ? value : boot;
  if (next) document.documentElement.setAttribute(name, next);
  else document.documentElement.removeAttribute(name);
}

/** Write, update, or remove one managed `<head>` tag. */
function syncHeadTag(spec: HeadTagSpec, value: string | undefined): void {
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

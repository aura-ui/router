import {
  getHeadTags,
  resolveDocumentMetaWithParams,
  type DocumentMetaValues,
  type HeadTagSpec,
} from '../../aura-routing-engine/core/document';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';

/** Marker on tags written by apply — only marked tags are removed on omit. */
const OWNED = 'data-aura-head';

/** Per-document snapshot captured before the first apply (revert target on omit). */
export const DOCUMENT_META_BOOT = Symbol.for('aura.documentMeta.boot');

type Boot = {
  title?: string;
  lang?: string;
  dir?: string;
};

function getBoot(): Boot {
  const doc = document as Document & { [DOCUMENT_META_BOOT]?: Boot };
  return (doc[DOCUMENT_META_BOOT] ??= {});
}

/**
 * Snapshot boot `document.title` before the first apply or optimistic preview.
 * Preview writes title before commit; without this, first apply would treat
 * the optimistic title as boot and later omits would restore the wrong value.
 */
export function captureDocumentTitleBoot(): string {
  const boot = getBoot();
  return (boot.title ??= document.title);
}

/**
 * Write resolved meta to the live document after view commit.
 *
 * Updates `document.title`, `<html lang|dir>`, and managed `<head>` tags.
 * Tags this function creates are marked `data-aura-head`; on omit they are removed
 * and title/lang/dir revert to values captured before the first apply (boot state).
 */
export function applyDocumentMeta(to: MatchedRouteInfo, htmlMeta?: DocumentMetaValues): void {
  const meta = resolveDocumentMetaWithParams(to, htmlMeta);
  const boot = getBoot();
  const titleBoot = captureDocumentTitleBoot();

  document.title = meta?.title !== undefined ? meta.title : titleBoot;

  boot.lang ??= document.documentElement.getAttribute('lang') ?? '';
  boot.dir ??= document.documentElement.getAttribute('dir') ?? '';
  applyRootAttr('lang', meta?.lang, boot.lang);
  applyRootAttr('dir', meta?.dir, boot.dir);

  for (const spec of getHeadTags()) {
    applyHeadTag(spec, meta?.tags?.[spec.id]);
  }
}

/** Apply resolved value or revert `<html lang|dir>` to boot snapshot. */
function applyRootAttr(name: 'lang' | 'dir', value: string | undefined, bootValue: string): void {
  const next = value !== undefined ? value : bootValue;
  if (next) document.documentElement.setAttribute(name, next);
  else document.documentElement.removeAttribute(name);
}

/** Apply resolved head tag value or remove an owned tag on omit. */
function applyHeadTag(spec: HeadTagSpec, value: string | undefined): void {
  if (value === undefined) {
    document.head.querySelector(`${spec.selector}[${OWNED}]`)?.remove();
    return;
  }

  const el = document.head.querySelector(spec.selector) ?? document.head.appendChild(document.createElement(spec.tag));
  for (const [attr, attrValue] of Object.entries(spec.attrs)) el.setAttribute(attr, attrValue);
  el.setAttribute(spec.valueAttr, value);
  el.setAttribute(OWNED, '');
}

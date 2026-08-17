import { stringToHtml } from '../../../aura-utils/misc/dom';
import { getHeadTags } from './schema';
import { hasDocumentMeta, type DocumentMetaValues } from './types';

/** Result of parsing a fetched HTML string in {@link processHtml}. */
export type PreparedHtml = {
  /** Mount fragment (full html, matched `outerHTML`, or original on extract miss). */
  fragment: string;
  /** Document meta from the parsed document; `undefined` when no head fields matched. */
  meta: DocumentMetaValues | undefined;
};

/**
 * Parse HTML once: optional `extract` fragment + {@link extractDocumentMeta}.
 *
 * Meta is always read from the **full** parsed document, not from the extracted subtree.
 * Without a selector, `fragment` is the original string. On extract miss, warns and keeps
 * the full `html` as `fragment`.
 *
 * @param selector Route `extract` attr, or null/undefined to skip fragment extraction.
 * @param href Route URL — logged when the selector matches nothing.
 */
export function processHtml(html: string, selector: string | null | undefined, href: string): PreparedHtml {
  const doc = stringToHtml(html);
  const meta = extractDocumentMeta(doc);
  if (!selector) return { fragment: html, meta };

  const el = doc.querySelector(selector);
  if (el) return { fragment: el.outerHTML, meta };

  console.warn(`Nothing found for extract selector "${selector}" — using full HTML. Page — ${href}`);
  return { fragment: html, meta };
}

/**
 * Read title, `<html lang|dir>`, and slots from {@link getHeadTags} on a parsed document.
 *
 * @returns `undefined` when {@link hasDocumentMeta} is false (caller treats as “no meta”).
 */
export function extractDocumentMeta(doc: Document): DocumentMetaValues | undefined {
  const meta: DocumentMetaValues = {};
  const title = doc.title.trim();
  if (title) meta.title = title;

  const lang = doc.documentElement.getAttribute('lang')?.trim();
  if (lang) meta.lang = lang;
  const dir = doc.documentElement.getAttribute('dir')?.trim();
  if (dir) meta.dir = dir;

  const tags: Record<string, string> = {};
  for (const spec of getHeadTags()) {
    const value = doc.querySelector(spec.selector)?.getAttribute(spec.valueAttr)?.trim();
    if (value) tags[spec.id] = value;
  }
  if (Object.keys(tags).length) meta.tags = tags;

  return hasDocumentMeta(meta) ? meta : undefined;
}

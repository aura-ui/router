import { stringToHtml } from '../../../aura-utils/misc/dom';
import { getHeadTags } from './schema';
import { hasDocumentMeta, type DocumentMetaValues } from './types';

export type PreparedHtml = {
  fragment: string;
  meta: DocumentMetaValues | undefined;
};

/**
 * One parse pass: optional `extract` fragment + document meta from `<head>`.
 * On extract miss, warns and keeps full `html`. `meta` is always present (`undefined` if empty).
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

/** Title, `<html lang|dir>`, and {@link getHeadTags}. Empty → `undefined`. */
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

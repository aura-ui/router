import { stringToHtml } from '../../../aura-utils/misc/dom';
import { getHeadTags } from './schema';
import { hasDocumentMeta, type DocumentMetaValues } from './types';

/** Output of {@link processHtml} — view fragment plus extracted meta. */
export type PreparedHtml = {
  /** HTML to mount: full page, matched `outerHTML`, or original on extract miss. */
  fragment: string;
  /** Meta from the parsed document; `undefined` when nothing matched. */
  meta: DocumentMetaValues | undefined;
};

/**
 * Parse fetched HTML once: extract a view fragment and read document meta.
 *
 * Meta always comes from the **full** parsed document, not from the extracted subtree.
 * Without a selector, `fragment` is the original string.
 * On selector miss or invalid CSS, logs a warning and keeps the full `html` as `fragment`.
 *
 * @param selector Route `extract` attr, or null/undefined to skip fragment extraction.
 * @param href Route URL — included in the warning when the selector matches nothing.
 */
export function processHtml(html: string, selector: string | null | undefined, href: string): PreparedHtml {
  const doc = stringToHtml(html);
  const meta = extractDocumentMeta(doc);
  if (!selector) return { fragment: html, meta };

  let el: Element | null = null;
  try {
    el = doc.querySelector(selector);
  } catch {
    // Invalid CSS selector — same fallback as a miss.
  }
  if (el) return { fragment: el.outerHTML, meta };

  console.warn(`Nothing found for extract selector "${selector}" — using full HTML. Page — ${href}`);
  return { fragment: html, meta };
}

/**
 * Read title, `<html lang|dir>`, and registered `<head>` slots from a parsed document.
 *
 * @returns `undefined` when nothing was found ({@link hasDocumentMeta} is false).
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

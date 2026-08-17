import { stringToHtml } from '../../../aura-utils/misc/dom';
import { headTags } from './schema';
import type { DocumentHeadValues } from './types';

export type PreparedHtml = {
  fragment: string;
  head: DocumentHeadValues | undefined;
};

/**
 * One parse pass: optional `extract` fragment + document head from `<head>`.
 * On extract miss, warns and keeps full `html`. `head` is always present (`undefined` if empty).
 */
export function processHtml(html: string, selector: string | null | undefined, href: string): PreparedHtml {
  const doc = stringToHtml(html);
  const head = extractDocumentHead(doc);
  if (!selector) return { fragment: html, head };

  const el = doc.querySelector(selector);
  if (el) return { fragment: el.outerHTML, head };

  console.warn(`Nothing found for extract selector "${selector}" — using full HTML. Page — ${href}`);
  return { fragment: html, head };
}

/** Title + {@link headTags}. Empty → `undefined`. */
export function extractDocumentHead(doc: Document): DocumentHeadValues | undefined {
  const head: DocumentHeadValues = {};
  const title = doc.title.trim();
  if (title) head.title = title;

  const tags: Record<string, string> = {};
  for (const spec of headTags) {
    const value = doc.querySelector(spec.selector)?.getAttribute(spec.valueAttr)?.trim();
    if (value) tags[spec.id] = value;
  }
  if (Object.keys(tags).length) head.tags = tags;

  return head.title || head.tags ? head : undefined;
}

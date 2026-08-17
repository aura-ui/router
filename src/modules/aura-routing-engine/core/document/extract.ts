import { stringToHtml } from '../../../aura-utils/misc/dom';
import { hasDocumentHead } from './resolve';
import { headExtraction, type HeadExtractionRule } from './schema';
import type { DocumentHeadValues } from './types';

export type PreparedHtml = {
  fragment: string;
  head?: DocumentHeadValues;
};

/**
 * One parse pass: optional `extract` fragment + document head from `<head>`.
 * On extract miss, warns and keeps full `html` (head still returned when present).
 */
export function processHtml(html: string, selector: string | null | undefined, href: string): PreparedHtml {
  const doc = stringToHtml(html);
  const head = extractDocumentHead(doc);
  if (!selector) return { fragment: html, ...(head !== undefined && { head }) };

  const el = doc.querySelector(selector);
  if (el) return { fragment: el.outerHTML, ...(head !== undefined && { head }) };

  console.warn(`Nothing found for extract selector "${selector}" — using full HTML. Page — ${href}`);
  return { fragment: html, ...(head !== undefined && { head }) };
}

/** Apply {@link headExtraction} (or a custom schema) to a parsed document. Empty → `undefined`. */
export function extractDocumentHead(doc: Document, schema: readonly HeadExtractionRule[] = headExtraction): DocumentHeadValues | undefined {
  const head: DocumentHeadValues = {};
  for (const { key, select } of schema) {
    const value = select(doc);
    if (value) head[key] = value;
  }
  return hasDocumentHead(head) ? head : undefined;
}

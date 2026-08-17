import type { DocumentHeadValues } from './types';

export type HeadExtractionRule = {
  key: keyof DocumentHeadValues;
  select: (doc: Document) => string | undefined;
};

export const headExtraction: readonly HeadExtractionRule[] = [
  { key: 'title', select: (doc) => doc.title.trim() || undefined },
  { key: 'description', select: (doc) => doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || undefined },
  { key: 'canonical', select: (doc) => doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || undefined },
];

/** Extracted document metadata: `<title>`, `<html lang|dir>`, and managed `<head>` tags. */
export type DocumentMetaValues = {
  title?: string;
  /** From `<html lang>`. */
  lang?: string;
  /** From `<html dir>`. */
  dir?: string;
  tags?: Record<string, string>;
};

/** True when title, html attrs, or at least one tag is set. */
export function hasDocumentMeta(meta: DocumentMetaValues | null | undefined): meta is DocumentMetaValues {
  if (!meta) return false;
  if (meta.title || meta.lang || meta.dir) return true;
  return Object.values(meta.tags ?? {}).some(Boolean);
}

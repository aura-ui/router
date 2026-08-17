/**
 * Document metadata for one navigation target (extract output and resolve output share this shape).
 *
 * Produced by {@link extractDocumentMeta} and/or {@link resolveDocumentMetaWithParams}.
 * Host apply writes the resolved result to the live document after commit
 * (`aura-router/core/document-meta.ts`).
 */
export type DocumentMetaValues = {
  /** Page title (`document.title` / `<title>`). */
  title?: string;
  /** From fetched `<html lang>`. */
  lang?: string;
  /** From fetched `<html dir>`. */
  dir?: string;
  /**
   * Managed `<head>` slot values keyed by {@link HeadTagSpec.id}
   * (e.g. `meta:name:description`, `link:rel:canonical`, `meta:property:og:title`).
   */
  tags?: Record<string, string>;
};

/** Non-empty {@link DocumentMetaValues} (at least one field set). */
export function hasDocumentMeta(meta: DocumentMetaValues | null | undefined): meta is DocumentMetaValues {
  if (!meta) return false;
  if (meta.title || meta.lang || meta.dir) return true;
  return Object.values(meta.tags ?? {}).some(Boolean);
}

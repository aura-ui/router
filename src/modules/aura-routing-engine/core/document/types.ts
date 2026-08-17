/**
 * Meta for one navigation target — title, `<html lang|dir>`, and managed `<head>` tags.
 *
 * Same shape after {@link extractDocumentMeta} (from fetched HTML) and
 * {@link resolveDocumentMetaWithParams} (after route attrs are applied).
 * Host writes the resolved result to the live document on commit
 * (`aura-router/core/document-meta.ts`).
 */
export type DocumentMetaValues = {
  /** Tab title — from `<title>` or route attrs. */
  title?: string;
  /** From fetched `<html lang>`. */
  lang?: string;
  /** From fetched `<html dir>`. */
  dir?: string;
  /**
   * Values for managed `<head>` slots, keyed by {@link HeadTagSpec.id}
   * (e.g. `meta:name:description`, `link:rel:canonical`).
   */
  tags?: Record<string, string>;
};

/** True when at least one field in {@link DocumentMetaValues} is set. */
export function hasDocumentMeta(meta: DocumentMetaValues | null | undefined): meta is DocumentMetaValues {
  if (!meta) return false;
  if (meta.title || meta.lang || meta.dir) return true;
  return Object.values(meta.tags ?? {}).some(Boolean);
}

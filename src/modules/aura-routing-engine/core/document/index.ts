/**
 * Document meta pipeline — extract from HTML, resolve with route attrs, registry of `<head>` slots.
 *
 * Writing to the live document is host-only: `aura-router/core/document-meta.ts`.
 */
export { extractDocumentMeta, processHtml } from './extract';
export { resolveDocumentMetaWithParams } from './resolve';
export {
  CANONICAL_ID,
  META_DESCRIPTION_ID,
  configureDocumentMeta,
  getHeadTags,
  type HeadTagInput,
  type HeadTagSpec,
} from './schema';
export { hasDocumentMeta, type DocumentMetaValues } from './types';

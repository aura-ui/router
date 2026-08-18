import { getHeadTags, resolveDocumentMetaWithParams, type DocumentMetaValues, type HeadTagSpec } from '../../aura-routing-engine/core/document';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';

/** Marker on tags written by apply — only marked tags are removed on omit. */
const OWNED = 'data-aura-head';

let bootTitle: string | undefined;
let bootLang: string | undefined;
let bootDir: string | undefined;
let pendingBaseTitle: string | null = null;
const pendingTitleById = new Map<number, string>();
const pendingTitleOrder: number[] = [];
const pendingResolvedById = new Map<number, DocumentMetaValues | null>();

/**
 * Optimistically updates `document.title` before commit.
 * Applies only when the target resolves an explicit title.
 */
export function previewDocumentTitle(id: number, to: MatchedRouteInfo, htmlMeta?: DocumentMetaValues): void {
  const resolved = resolveDocumentMetaWithParams(to, htmlMeta);
  pendingResolvedById.set(id, resolved);
  if (resolved?.title === undefined) return;
  if (pendingBaseTitle === null) pendingBaseTitle = document.title;
  pendingTitleById.set(id, resolved.title);
  const index = pendingTitleOrder.indexOf(id);
  if (index !== -1) pendingTitleOrder.splice(index, 1);
  pendingTitleOrder.push(id);
  document.title = resolved.title;
}

/** Marks optimistic title for this navigation as committed. */
export function confirmDocumentTitle(id: number): void {
  pendingResolvedById.delete(id);
  if (!removePendingTitle(id)) return;
  if (pendingTitleOrder.length === 0) pendingBaseTitle = null;
}

/**
 * Reverts optimistic `document.title`.
 * If `id` is provided, rollback is applied only for matching pending navigation.
 */
export function rollbackDocumentTitle(id?: number): void {
  if (id === undefined) {
    clearPendingTitle();
    pendingResolvedById.clear();
    return;
  }
  pendingResolvedById.delete(id);
  if (!removePendingTitle(id)) return;
  document.title = currentPendingTitle() ?? pendingBaseTitle ?? document.title;
  if (pendingTitleOrder.length === 0) pendingBaseTitle = null;
}

/**
 * Resolve meta for commit, reusing pending value from preview when possible.
 * Reuse is safe only when `htmlMeta` is absent (same inputs as preview).
 */
export function resolvePendingDocumentMeta(
  id: number,
  to: MatchedRouteInfo,
  htmlMeta?: DocumentMetaValues,
): DocumentMetaValues | null {
  if (htmlMeta === undefined && pendingResolvedById.has(id)) {
    return pendingResolvedById.get(id) ?? null;
  }
  const resolved = resolveDocumentMetaWithParams(to, htmlMeta);
  pendingResolvedById.set(id, resolved);
  return resolved;
}

/**
 * Write resolved meta to the live document after view commit.
 *
 * Updates `document.title`, `<html lang|dir>`, and managed `<head>` tags.
 * Tags this function creates are marked `data-aura-head`; on omit they are removed
 * and title/lang/dir revert to values captured before the first apply (boot state).
 */
export function applyDocumentMeta(to: MatchedRouteInfo, htmlMeta?: DocumentMetaValues): void {
  const resolved = resolveDocumentMetaWithParams(to, htmlMeta);
  applyResolvedDocumentMeta(resolved);
}

/** Apply pre-resolved document meta to live DOM after commit. */
export function applyResolvedDocumentMeta(resolved: DocumentMetaValues | null): void {

  bootTitle ??= document.title;
  if (resolved?.title !== undefined) document.title = resolved.title;
  else document.title = bootTitle;

  bootLang ??= document.documentElement.getAttribute('lang') ?? '';
  bootDir ??= document.documentElement.getAttribute('dir') ?? '';
  syncRootAttr('lang', resolved?.lang, bootLang);
  syncRootAttr('dir', resolved?.dir, bootDir);

  for (const spec of getHeadTags()) {
    syncHeadTag(spec, resolved?.tags?.[spec.id]);
  }
}

/** Write or revert a root attribute (`lang` / `dir`) against boot snapshot. */
function syncRootAttr(name: 'lang' | 'dir', value: string | undefined, boot: string): void {
  const next = value !== undefined ? value : boot;
  if (next) document.documentElement.setAttribute(name, next);
  else document.documentElement.removeAttribute(name);
}

/** Write, update, or remove one managed `<head>` tag. */
function syncHeadTag(spec: HeadTagSpec, value: string | undefined): void {
  if (value === undefined) {
    document.head.querySelector(`${spec.selector}[${OWNED}]`)?.remove();
    return;
  }

  const el =
    document.head.querySelector(spec.selector) ?? document.head.appendChild(document.createElement(spec.tag));
  for (const [attr, attrValue] of Object.entries(spec.attrs)) el.setAttribute(attr, attrValue);
  el.setAttribute(spec.valueAttr, value);
  el.setAttribute(OWNED, '');
}

function currentPendingTitle(): string | undefined {
  const lastId = pendingTitleOrder.at(-1);
  if (lastId === undefined) return undefined;
  return pendingTitleById.get(lastId);
}

function removePendingTitle(id: number): boolean {
  if (!pendingTitleById.has(id)) return false;
  pendingTitleById.delete(id);
  const index = pendingTitleOrder.indexOf(id);
  if (index !== -1) pendingTitleOrder.splice(index, 1);
  return true;
}

function clearPendingTitle(): void {
  if (pendingBaseTitle !== null) document.title = pendingBaseTitle;
  pendingBaseTitle = null;
  pendingTitleById.clear();
  pendingTitleOrder.length = 0;
}

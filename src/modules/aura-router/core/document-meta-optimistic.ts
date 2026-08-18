import { resolveDocumentMetaWithParams, type DocumentMetaValues } from '../../aura-routing-engine/core/document';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';

/** Optimistic title preview + pending resolve cache for in-flight navigations. */
export class OptimisticDocumentMeta {
  private pendingBaseTitle: string | null = null;
  private readonly pendingTitleById = new Map<number, string>();
  private readonly pendingTitleOrder: number[] = [];
  private readonly pendingResolvedById = new Map<number, DocumentMetaValues | null>();

  preview(id: number, to: MatchedRouteInfo, htmlMeta?: DocumentMetaValues): void {
    const resolved = resolveDocumentMetaWithParams(to, htmlMeta);
    this.pendingResolvedById.set(id, resolved);
    if (resolved?.title === undefined) return;
    if (this.pendingBaseTitle === null) this.pendingBaseTitle = document.title;
    this.pendingTitleById.set(id, resolved.title);
    const index = this.pendingTitleOrder.indexOf(id);
    if (index !== -1) this.pendingTitleOrder.splice(index, 1);
    this.pendingTitleOrder.push(id);
    document.title = resolved.title;
  }

  rollback(id: number): void {
    this.pendingResolvedById.delete(id);
    if (!this.removePendingTitle(id)) return;
    document.title = this.currentPendingTitle() ?? this.pendingBaseTitle ?? document.title;
    if (this.pendingTitleOrder.length === 0) this.pendingBaseTitle = null;
  }

  resolveForCommit(id: number, to: MatchedRouteInfo, htmlMeta?: DocumentMetaValues): DocumentMetaValues | null {
    if (htmlMeta === undefined && this.pendingResolvedById.has(id)) {
      return this.pendingResolvedById.get(id) ?? null;
    }
    return resolveDocumentMetaWithParams(to, htmlMeta);
  }

  clear(id: number): void {
    this.pendingResolvedById.delete(id);
    if (this.removePendingTitle(id) && this.pendingTitleOrder.length === 0) this.pendingBaseTitle = null;
  }

  private currentPendingTitle(): string | undefined {
    const lastId = this.pendingTitleOrder.at(-1);
    if (lastId === undefined) return undefined;
    return this.pendingTitleById.get(lastId);
  }

  private removePendingTitle(id: number): boolean {
    if (!this.pendingTitleById.has(id)) return false;
    this.pendingTitleById.delete(id);
    const index = this.pendingTitleOrder.indexOf(id);
    if (index !== -1) this.pendingTitleOrder.splice(index, 1);
    return true;
  }
}

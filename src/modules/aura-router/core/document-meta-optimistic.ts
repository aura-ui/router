import { resolveTitle } from '../../aura-routing-engine/core/document';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { captureDocumentTitleBoot } from './document-meta';

/** Optimistic `document.title` preview for in-flight navigations. */
export class OptimisticDocumentMeta {
  private pendingBaseTitle: string | null = null;
  private readonly pendingTitleById = new Map<number, string>();
  private readonly pendingTitleOrder: number[] = [];

  preview(id: number, to: MatchedRouteInfo): void {
    captureDocumentTitleBoot();
    const { metaTitle, metaTitleTemplate } = to.route;
    if (metaTitle == null && metaTitleTemplate == null) return;
    const title = resolveTitle(to.route, undefined, { ...to.query, ...to.params });
    if (title === undefined) return;
    if (this.pendingBaseTitle === null) this.pendingBaseTitle = document.title;
    this.pendingTitleById.set(id, title);
    const index = this.pendingTitleOrder.indexOf(id);
    if (index !== -1) this.pendingTitleOrder.splice(index, 1);
    this.pendingTitleOrder.push(id);
    document.title = title;
  }

  rollback(id: number): void {
    if (!this.removePendingTitle(id)) return;
    document.title = this.currentPendingTitle() ?? this.pendingBaseTitle ?? document.title;
    if (this.pendingTitleOrder.length === 0) this.pendingBaseTitle = null;
  }

  /** Drop preview state after successful commit (title already written by apply). */
  clear(id: number): void {
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

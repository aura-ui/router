import { resolveTitle } from '../../aura-routing-engine/core/document';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { captureDocumentTitleBoot } from './document-meta';

/** Optimistic `document.title` preview for in-flight navigations. */
export class OptimisticDocumentMeta {
  /** `document.title` when the first overlapping preview started. */
  private restoreTitle: string | undefined;
  private readonly stack: { id: number; title: string }[] = [];

  preview(id: number, to: MatchedRouteInfo): void {
    const { metaTitle, metaTitleTemplate } = to.route;
    if (metaTitle == null && metaTitleTemplate == null) return;

    const title = resolveTitle(to.route, undefined, { ...to.query, ...to.params });
    if (title === undefined) return;

    if (this.restoreTitle === undefined) {
      captureDocumentTitleBoot();
      this.restoreTitle = document.title;
    }
    this.remove(id);
    this.stack.push({ id, title });
    document.title = title;
  }

  rollback(id: number): void {
    if (!this.remove(id)) return;
    document.title = this.stack.at(-1)?.title ?? this.restoreTitle ?? document.title;
    if (this.stack.length === 0) this.restoreTitle = undefined;
  }

  /**
   * Drop all preview state after successful commit (title already written by apply).
   * Clears the whole stack so a late cancel of a superseded nav cannot restore shell.
   */
  clear(_id: number): void {
    this.stack.length = 0;
    this.restoreTitle = undefined;
  }

  private remove(id: number): boolean {
    const i = this.stack.findIndex((item) => item.id === id);
    if (i === -1) return false;
    this.stack.splice(i, 1);
    return true;
  }
}

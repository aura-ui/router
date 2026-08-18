import { resolveTitle } from '../../aura-routing-engine/core/document';
import type { MatchedRouteInfo } from '../../aura-routing-engine/core/match/url-matcher';
import { captureDocumentTitleBoot } from './document-meta';

/** Optimistic `document.title` preview for in-flight navigations. */
export class DocumentTitlePreview {
  /** Title before the first preview in the current session. */
  private baseTitle: string | undefined;
  private readonly previews: { id: number; title: string }[] = [];

  preview(id: number, to: MatchedRouteInfo): void {
    // No htmlMeta at url-aligned — resolveTitle returns undefined when only a template exists.
    const title = resolveTitle(to);
    if (title === undefined) return;

    if (this.baseTitle === undefined) {
      captureDocumentTitleBoot();
      this.baseTitle = document.title;
    }

    const i = this.previews.findIndex((p) => p.id === id);
    if (i !== -1) this.previews.splice(i, 1);
    this.previews.push({ id, title });
    document.title = title;
  }

  /** Restore title when navigation is cancelled or redirected. */
  cancel(id: number): void {
    const i = this.previews.findIndex((p) => p.id === id);
    if (i === -1) return;
    this.previews.splice(i, 1);
    document.title = this.previews.at(-1)?.title ?? this.baseTitle ?? document.title;
    if (this.previews.length === 0) this.baseTitle = undefined;
  }

  /**
   * Drop preview state after commit (title already written by apply).
   * Clears all previews so a late cancel of a superseded nav cannot restore shell.
   */
  commit(): void {
    this.previews.length = 0;
    this.baseTitle = undefined;
  }
}

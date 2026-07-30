import type { ViewCommitSnapshot, ViewCommitState } from './view-commit-state';

/**
 * Tracks {@link ViewCommitState} for one navigation transaction.
 *
 * @module view-mount/view-commit-tracker
 * @see {@link ./view-commit-state} — view vs history vs pipeline success vocabulary.
 */
export class ViewCommitTracker {
  /** Target URL of the navigation transaction (stable for the tracker lifetime). */
  readonly href: string;
  private _view: ViewCommitState = 'none';

  constructor(href: string) {
    this.href = href;
  }

  /** Current view mount state + {@link href} — read at transaction terminal (especially on error). */
  get snapshot(): ViewCommitSnapshot {
    return { view: this._view, href: this.href };
  }

  /** After successful `runViewCommit` on the enter branch (view staged, not yet promoted). */
  markViewStaged(): void {
    this._view = 'staged';
  }

  /** After `commitStagedView()` on enter routes (happy-path terminal commit). */
  markViewCommitted(): void {
    this._view = 'committed';
  }

  /** Whether view state reached a terminal committed snapshot for this transaction. */
  isViewCommitted(): boolean {
    return this._view === 'committed';
  }

  /**
   * Render failed but error UI mounted on target (after exit `left` cleanup).
   * History and error callbacks treat navigation as user-visible on target URL.
   */
  markViewCommittedAfterErrorRecovery(): void {
    this._view = 'committed';
  }
}

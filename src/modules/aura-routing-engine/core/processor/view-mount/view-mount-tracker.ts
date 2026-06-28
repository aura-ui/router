import type { CommitSnapshot, ViewCommitState } from '../../view-mount/view-mount-state';

/**
 * Tracks {@link ViewCommitState} for one navigation transaction inside
 * {@link ProcessorPipeline}.
 *
 * One instance is created per {@link AuraRoutingProcessor.run} call with the target
 * `href`. Pipeline steps call {@link markViewStaged}, {@link markViewCommitted}, or
 * {@link markViewCommittedAfterErrorRecovery}; the resulting {@link snapshot} is attached
 * to terminal `{ status: 'error' }` outcomes and drives downstream history / error reporting.
 *
 * **State machine**
 *
 * | `view` | Set by | Meaning |
 * | --- | --- | --- |
 * | `none` | (initial) | Target view not mounted yet |
 * | `staged` | {@link markViewStaged} after successful `runViewCommit` | View mounted, not yet promoted via `commitStagedView` |
 * | `committed` | {@link markViewCommitted} or {@link markViewCommittedAfterErrorRecovery} | User-visible UI on the target route (happy path or error recovery) |
 *
 * **Consumers of {@link snapshot}**
 *
 * - {@link FailedNavigation.complete} — callbacks, history, `prev`
 *
 * Vocabulary (see {@link CommitSnapshot}): view commit ≠ history commit ≠
 * {@link TransactionResult} `status: 'viewCommitted'` (full pipeline success).
 *
 * Replaces the legacy `viewCommitted: phase === 'render'` heuristic — render-phase errors
 * no longer imply a committed view unless error UI was actually mounted.
 */
export class CommitTracker {
  /** Target URL of the navigation transaction (stable for the tracker lifetime). */
  readonly href: string;
  private _view: ViewCommitState = 'none';

  /** @param href Target route URL from {@link NavigationTransaction.to}. */
  constructor(href: string) {
    this.href = href;
  }

  /** Current view mount state + {@link href} — read at transaction terminal (especially on error). */
  get snapshot(): CommitSnapshot {
    return { view: this._view, href: this.href };
  }

  /**
   * Called from `runRender` after each successful `runViewCommit` on the enter branch.
   * View is mounted but still staged until transition hooks run and {@link markViewCommitted} fires.
   */
  markViewStaged(): void {
    this._view = 'staged';
  }

  /**
   * Called from `commitEnterViews` after `route.commitStagedView()` on all enter routes
   * (post–transition-in hooks). Happy-path terminal commit.
   */
  markViewCommitted(): void {
    this._view = 'committed';
  }

  /**
   * Called from `runRender` when render fails but error UI was mounted on the target route
   * (after exit `left` cleanup). Sets `committed` so history and error callbacks treat the
   * navigation as user-visible on the target URL.
   */
  markViewCommittedAfterErrorRecovery(): void {
    this._view = 'committed';
  }
}

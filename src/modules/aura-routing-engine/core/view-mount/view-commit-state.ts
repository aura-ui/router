/**
 * View mount state during a navigation transaction.
 *
 * Implementation: {@link ./view-commit-tracker!ViewCommitTracker}, {@link ./view-commit-render!runViewCommit}.
 *
 * Vocabulary (do not confuse):
 * - **View commit** — {@link ViewCommitState} on {@link ViewCommitSnapshot} (`none` / `staged` / `committed`).
 * - **History commit** — `provider.commit()` / {@link HistoryPolicy} `commit-target` (address bar URL).
 * - **Pipeline success** — {@link TransactionResult} `status: 'navigationSucceeded'` (full transaction OK).
 */
export type ViewCommitState = 'none' | 'staged' | 'committed';

/** Snapshot of view mount state + target URL at a point in the transaction. */
export interface ViewCommitSnapshot {
  /** View mount state — not a DOM node reference. */
  view: ViewCommitState;
  href: string;
}

/** Whether the target URL should be written to browser history (`view === 'committed'`). */
export function isViewCommittedForHistory(viewCommit: ViewCommitSnapshot): boolean {
  return viewCommit.view === 'committed';
}

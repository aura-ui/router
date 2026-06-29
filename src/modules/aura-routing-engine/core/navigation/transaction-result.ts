import type { FailedNavigation } from '../failure';

/** Terminal pipeline outcome: navigation failed with a structured failure object. */
export type NavigationErrorResult = { status: 'error'; failure: FailedNavigation };

/**
 * Terminal processor outcome returned to {@link AuraRoutingEngine}.
 *
 * `status: 'navigationSucceeded'` — full pipeline succeeded (not the same as
 * {@link ViewCommitSnapshot.view} `committed` or {@link FailedNavigation.viewCommitted}).
 * History URL commit is done by the engine after success.
 */
export type TransactionResult =
  | { status: 'navigationSucceeded' }
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | NavigationErrorResult;

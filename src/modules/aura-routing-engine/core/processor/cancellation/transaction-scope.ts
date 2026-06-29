import type { TransactionResult } from '../../navigation/transaction-result';
import type { TransitionMap } from '../../route-tree/transition-plan';
import type { CommitTracker } from '../../view-mount/view-mount-tracker';
import { rollbackCancelledNavigation } from '../../view-mount/view-rollback';
import type { AuraRoutingProcessorJob } from './job';

export interface CancelledTransactionScope<T> {
  transitionPlan: TransitionMap;
  navigationJob: AuraRoutingProcessorJob;
  viewCommitTracker: CommitTracker;
  runTransaction: () => Promise<T>;
}

/**
 * One processor transaction with two rollback paths:
 *
 * - **abort listener** — supersede while `runTransaction()` is still awaiting (transitions, load).
 *   Rolls back immediately; `finally` must not repeat this.
 * - **finally** — guard returned `cancelled` without aborting the job.
 */
export async function withCancelledTransactionScope(
  scope: CancelledTransactionScope<TransactionResult>,
): Promise<TransactionResult> {
  const {
    transitionPlan,
    navigationJob,
    viewCommitTracker,
    runTransaction,
  } = scope;
  const rollbackUncommittedView = (): void =>
    rollbackCancelledNavigation(transitionPlan, viewCommitTracker);

  navigationJob.signal.addEventListener('abort', rollbackUncommittedView, { once: true });

  let transactionResult: TransactionResult | undefined;
  try {
    transactionResult = await runTransaction();
    return transactionResult;
  } finally {
    navigationJob.signal.removeEventListener('abort', rollbackUncommittedView);
    if (shouldRollbackAfterTransaction(viewCommitTracker, navigationJob, transactionResult)) {
      rollbackUncommittedView();
    }
  }
}

/** Guard cancel — job was not aborted, processor returned `cancelled`. */
function shouldRollbackAfterTransaction(
  viewCommitTracker: CommitTracker,
  navigationJob: AuraRoutingProcessorJob,
  transactionResult: TransactionResult | undefined,
): boolean {
  if (viewCommitTracker.isViewCommitted() || navigationJob.aborted) return false;
  return transactionResult?.status === 'cancelled';
}

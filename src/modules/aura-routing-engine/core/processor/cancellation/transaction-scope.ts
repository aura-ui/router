import type { TransactionResult } from '../../navigation/transaction-result';
import type { TransitionMap } from '../../route-tree/transition-plan';
import type { CommitTracker } from '../../view-mount/view-mount-tracker';
import type { AuraRoutingProcessorJob } from './job';
import { rollbackCancelledNavigation } from './view-rollback';

export interface CancelledTransactionScope<T> {
  plan: TransitionMap;
  job: AuraRoutingProcessorJob;
  commitTracker: CommitTracker;
  run: () => Promise<T>;
}

/**
 * One processor transaction with two rollback paths:
 *
 * - **abort listener** — supersede while `run()` is still awaiting (transitions, load).
 *   Rolls back immediately; `finally` must not repeat this.
 * - **finally** — guard returned `cancelled` without aborting the job.
 */
export async function withCancelledTransactionScope(
  scope: CancelledTransactionScope<TransactionResult>,
): Promise<TransactionResult> {
  const { plan, job, commitTracker, run } = scope;
  const rollback = (): void => rollbackCancelledNavigation(plan, commitTracker);

  job.signal.addEventListener('abort', rollback, { once: true });

  let result: TransactionResult | undefined;
  try {
    result = await run();
    return result;
  } finally {
    job.signal.removeEventListener('abort', rollback);
    if (shouldRollbackAfterRun(commitTracker, job, result)) {
      rollback();
    }
  }
}

/** Guard cancel — job was not aborted, processor returned `cancelled`. */
function shouldRollbackAfterRun(
  commitTracker: CommitTracker,
  job: AuraRoutingProcessorJob,
  result: TransactionResult | undefined,
): boolean {
  if (commitTracker.isViewCommitted() || job.aborted) return false;
  return result?.status === 'cancelled';
}

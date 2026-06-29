import {
  createLifecycleRuntimeContext,
  LifecycleRunner,
} from '../../lifecycle';
import type { TransactionResult } from '../../navigation/transaction-result';
import type { RouteInstance, RouteLifecycleContext } from '../../route/types';
import { isRenderError, runViewCommit } from '../../view-mount/view-commit-render';

import type { PipelineContext } from '../processor-pipeline';

const lifecycleRunner = new LifecycleRunner();

function leftContext(route: RouteInstance): RouteLifecycleContext {
  return {
    phase: 'left',
    to: { pathname: '/' },
    from: null,
    router: { navigate: () => {} },
    route,
    action: 'push',
    jobId: 0,
    signal: new AbortController().signal,
  };
}

/** Tier 0: teardown exit view → render enter → commit gate (no lifecycle pipeline). */
export async function runFastPath(pipelineContext: PipelineContext): Promise<TransactionResult> {
  const { transaction, navigationJob, viewCommitTracker, isJobActive, commitGate } = pipelineContext;
  const { plan } = transaction;

  for (const exit of plan.exitRoutes) {
    exit.route.onLeft(leftContext(exit.route));
  }

  const enter = plan.enterRoutes[0]!;

  const viewCommit = await runViewCommit(enter, navigationJob);

  if (viewCommit === 'aborted' || !isJobActive()) {
    return { status: 'cancelled' };
  }

  if (isRenderError(viewCommit)) {
    viewCommitTracker.markViewCommittedAfterErrorRecovery();
    return lifecycleRunner.failNavigation(
      enter,
      viewCommit.error,
      'render',
      createLifecycleRuntimeContext(pipelineContext),
    );
  }

  viewCommitTracker.markViewStaged();
  enter.route.commitStagedView?.();
  viewCommitTracker.markViewCommitted();
  commitGate?.();

  return { status: 'navigationSucceeded' };
}

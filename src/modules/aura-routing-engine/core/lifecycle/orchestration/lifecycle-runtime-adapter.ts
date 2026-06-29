import type { LifecycleContextInput } from '../context/lifecycle-context';

import type {
  LifecyclePipelineBridge,
  LifecycleRuntimeContext,
} from './lifecycle-runner.types';

/** Maps lifecycle runtime context to the slice required by route callbacks. */
export function toLifecycleContextInput(
  context: LifecycleRuntimeContext,
): LifecycleContextInput {
  return {
    from: context.transaction.from,
    action: context.transaction.action,
    router: context.router,
    navigationJob: context.navigationJob,
  };
}

/**
 * Bridge from processor pipeline context to lifecycle runtime context.
 * Picks only lifecycle-owned fields so processor extras never leak inward.
 */
export function createLifecycleRuntimeContext(
  pipeline: LifecyclePipelineBridge,
): LifecycleRuntimeContext {
  return {
    transaction: {
      from: pipeline.transaction.from,
      to: pipeline.transaction.to,
      action: pipeline.transaction.action,
      plan: pipeline.transaction.plan,
    },
    navigationJob: pipeline.navigationJob,
    router: pipeline.router,
    hookRegistry: pipeline.hookRegistry,
    viewCommitTracker: pipeline.viewCommitTracker,
    reportHookError: pipeline.reportHookError,
    isJobActive: pipeline.isJobActive,
    ...(pipeline.dataSnapshot && { dataSnapshot: pipeline.dataSnapshot }),
  };
}

import type { LifecycleContextInput } from '../context/lifecycle-context';

import type { LifecycleRuntimeContext } from './lifecycle-runner.types';

export function toLifecycleContextInput(
  context: LifecycleRuntimeContext,
): LifecycleContextInput {
  return {
    from: context.transaction.from,
    action: context.transaction.action,
    router: context.router,
    job: context.job,
  };
}

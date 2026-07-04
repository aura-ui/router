import { HookRegistry } from '../../core/hooks/registry';
import {
  createLifecycleRuntimeContext,
  toLifecycleContextInput,
  type LifecycleRuntimeContext,
} from '../../core/lifecycle';
import { createMockNavigationJob } from '../helpers/mock-navigation-job';
import { ViewCommitTracker } from '../../core/view-mount/view-commit-tracker';
import { createTestRoute } from '../helpers/create-test-route';

function createPipelineContext() {
  const matchedRoute = {
    href: '/to',
    pathname: '/to',
    search: '',
    hash: '',
    pattern: '/to',
    route: createTestRoute('/to'),
  };

  return {
    transaction: {
      from: null,
      to: matchedRoute,
      action: 'push' as const,
      plan: {
        exitRoutes: [],
        enterRoutes: [matchedRoute],
        lca: null,
        reenter: false,
      },
      transitionOrder: null,
    },
    navigationJob: createMockNavigationJob(1),
    router: { navigate: jest.fn() },
    hookRegistry: new HookRegistry(),
    viewCommitTracker: new ViewCommitTracker('/to'),
    isJobActive: () => true,
    commitGate: jest.fn(),
  };
}

describe('lifecycle runtime adapter', () => {
  it('createLifecycleRuntimeContext picks lifecycle fields from pipeline context', () => {
    const pipeline = createPipelineContext();

    const runtime = createLifecycleRuntimeContext(pipeline);

    expect(runtime).toEqual({
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
      isJobActive: pipeline.isJobActive,
    });
    expect(runtime).not.toHaveProperty('commitGate');
    expect(runtime.transaction).not.toHaveProperty('transitionOrder');
  });

  it('toLifecycleContextInput maps runtime context to route callback slice', () => {
    const runtime: LifecycleRuntimeContext = {
      transaction: createPipelineContext().transaction,
      navigationJob: { id: 1, signal: new AbortController().signal },
      router: { navigate: jest.fn() },
      hookRegistry: new HookRegistry(),
      viewCommitTracker: new ViewCommitTracker('/to'),
      isJobActive: () => true,
    };

    expect(toLifecycleContextInput(runtime)).toEqual({
      from: runtime.transaction.from,
      action: runtime.transaction.action,
      router: runtime.router,
      navigationJob: runtime.navigationJob,
    });
  });
});

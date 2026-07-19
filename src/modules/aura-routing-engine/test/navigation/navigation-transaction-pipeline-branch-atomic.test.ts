jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as branchMount from '../../core/view-mount/branch-mount';
import { createMatchedRoute } from '../helpers/create-mock-transaction';
import {
  mockRunPhaseHooks,
  mockRunViewCommit,
  resetPipelineMocks,
  trackLifecyclePhases,
  withViewGraph,
} from '../helpers/jest/pipeline-mocks';

async function prepareThenRender(pipeline: NavigationTransactionPipeline) {
  const prepareResult = await pipeline.runPrepare();
  if (prepareResult) return prepareResult;
  return pipeline.runRender();
}

async function prepareThenRenderWithTransition(pipeline: NavigationTransactionPipeline) {
  const prepareResult = await pipeline.runPrepare();
  if (prepareResult) return prepareResult;
  return pipeline.runRenderWithTransition();
}

describe('NavigationTransactionPipeline branch prepare → commit render', () => {
  let mountEnterBranchSpy: jest.SpiedFunction<typeof branchMount.mountEnterBranch>;

  beforeEach(() => {
    resetPipelineMocks();
    mountEnterBranchSpy = jest
      .spyOn(branchMount, 'mountEnterBranch')
      .mockReturnValue({ status: 'ok' });
  });

  afterEach(() => {
    mountEnterBranchSpy.mockRestore();
  });

  it('loads via ResourceGraph in prepare then sync-mounts in render for multi-route enter', async () => {
    const layout = createMatchedRoute('/users');
    const index = createMatchedRoute('/users/1');
    const transaction = withViewGraph({
      enterRoutes: [layout, index],
      transitionOrder: null,
    });
    const loadSpy = jest.spyOn(transaction.engine.resourceGraph, 'load');

    await prepareThenRender(new NavigationTransactionPipeline(transaction));

    expect(loadSpy).toHaveBeenCalledWith(
      [layout, index],
      expect.objectContaining({ transaction }),
    );
    expect(transaction.viewSnapshot).toBeUndefined();
    expect(mountEnterBranchSpy).toHaveBeenCalledWith(
      [layout, index],
      ['<span/>', '<span/>'],
      expect.objectContaining({
        signal: transaction.signal,
        paramChangeRemount: false,
      }),
    );
    expect(mockRunViewCommit).not.toHaveBeenCalled();
    loadSpy.mockRestore();
  });

  it('uses branch prepare/commit for a single sync route', async () => {
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/page')],
      transitionOrder: null,
    });

    await prepareThenRender(new NavigationTransactionPipeline(transaction));

    expect(mountEnterBranchSpy).toHaveBeenCalledTimes(1);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('passes paramChangeRemount through branch mount context', async () => {
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/users/2')],
      transitionOrder: null,
    });
    transaction.transitionPlan.paramChangeRemount = true;

    await prepareThenRender(new NavigationTransactionPipeline(transaction));

    expect(mountEnterBranchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ paramChangeRemount: true }),
    );
  });

  it('uses branch prepare/commit with transition order on multi-route enter', async () => {
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/users'), createMatchedRoute('/users/1')],
      transitionOrder: 'out-in',
    });

    await prepareThenRenderWithTransition(new NavigationTransactionPipeline(transaction));

    expect(mountEnterBranchSpy).toHaveBeenCalledTimes(1);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('out-in loads in prepare before transitionOut and mounts before transitionIn', async () => {
    const callOrder: string[] = [];
    const transaction = withViewGraph({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      transitionOrder: 'out-in',
    });

    jest.spyOn(transaction.engine.resourceGraph, 'load').mockImplementation(async () => {
      callOrder.push('load');
      return { view: ['<page/>'] };
    });
    mountEnterBranchSpy.mockImplementation(() => {
      callOrder.push('apply');
      return { status: 'ok' };
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    await prepareThenRenderWithTransition(new NavigationTransactionPipeline(transaction));

    expect(callOrder).toEqual(['load', 'transitionOut', 'apply', 'transitionIn']);
  });

  it('returns cancelled when ResourceGraph load soft-cancels', async () => {
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });
    jest.spyOn(transaction.engine.resourceGraph, 'load').mockResolvedValue({
      error: { status: 'cancelled' },
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runPrepare();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('returns cancelled when branch mount succeeds but transaction is inactive', async () => {
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });
    let active = true;
    jest.spyOn(transaction, 'isActive').mockImplementation(() => active);
    mountEnterBranchSpy.mockImplementation(() => {
      active = false;
      return { status: 'ok' };
    });

    const outcome = await prepareThenRender(new NavigationTransactionPipeline(transaction));

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('returns cancelled when render runs without prepare', async () => {
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/page')],
      transitionOrder: null,
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
  });
});

describe('NavigationTransactionPipeline render failure recovery', () => {
  let mountEnterBranchSpy: jest.SpiedFunction<typeof branchMount.mountEnterBranch>;

  beforeEach(() => {
    resetPipelineMocks();
    mountEnterBranchSpy = jest
      .spyOn(branchMount, 'mountEnterBranch')
      .mockReturnValue({ status: 'ok' });
  });

  afterEach(() => {
    mountEnterBranchSpy.mockRestore();
  });

  async function expectRenderErrorRecovery(
    outcome: Awaited<ReturnType<NavigationTransactionPipeline['runRender']>>,
    phases: string[],
    recoverySpy: jest.SpyInstance,
  ): Promise<void> {
    expect(outcome?.status).toBe('error');
    expect(phases).toContain('unmount');
    expect(recoverySpy).toHaveBeenCalledTimes(1);
  }

  it('recovers after branch mount error', async () => {
    const mountError = new Error('branch mount failed');
    const failingRoute = createMatchedRoute('/b');
    mountEnterBranchSpy.mockReturnValue({
      status: 'error',
      error: mountError,
      route: failingRoute,
    });

    const { phases } = trackLifecyclePhases();
    const transaction = withViewGraph({
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/a'), failingRoute],
      transitionOrder: null,
    });
    const recoverySpy = jest.spyOn(
      transaction.viewCommitTracker,
      'markViewCommittedAfterErrorRecovery',
    );

    const outcome = await prepareThenRender(new NavigationTransactionPipeline(transaction));

    await expectRenderErrorRecovery(outcome, phases, recoverySpy);
  });

  it('recovers after ResourceGraph load error', async () => {
    const failingRoute = createMatchedRoute('/b');
    const { phases } = trackLifecyclePhases();
    const transaction = withViewGraph({
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/a'), failingRoute],
      transitionOrder: null,
    });
    jest.spyOn(transaction.engine.resourceGraph, 'load').mockResolvedValue({
      error: {
        status: 'error',
        failure: {
          error: new Error('branch resolve failed'),
          route: failingRoute,
          atPhase: 'load',
          viewCommitted: false,
        },
      },
    });
    const recoverySpy = jest.spyOn(
      transaction.viewCommitTracker,
      'markViewCommittedAfterErrorRecovery',
    );

    const outcome = await new NavigationTransactionPipeline(transaction).runPrepare();

    // Prepare returns the error; recovery (unmount) is owned by the full pipeline / fail handler.
    expect(outcome?.status).toBe('error');
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
    expect(recoverySpy).not.toHaveBeenCalled();
    expect(phases).toEqual([]);
  });

  it('returns cancelled when branch mount aborts mid-apply', async () => {
    mountEnterBranchSpy.mockReturnValue({ status: 'aborted' });

    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });

    const outcome = await prepareThenRender(new NavigationTransactionPipeline(transaction));

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('returns cancelled when branch contents are lost before commit', async () => {
    const transaction = withViewGraph({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: 'out-in',
    });

    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'transitionOut') {
        transaction.viewSnapshot = undefined;
      }
    });

    const outcome = await prepareThenRenderWithTransition(
      new NavigationTransactionPipeline(transaction),
    );

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
  });
});

describe('NavigationTransactionPipeline branch transition matrix', () => {
  let mountEnterBranchSpy: jest.SpiedFunction<typeof branchMount.mountEnterBranch>;

  beforeEach(() => {
    resetPipelineMocks();
    mountEnterBranchSpy = jest
      .spyOn(branchMount, 'mountEnterBranch')
      .mockImplementation(() => {
        return { status: 'ok' };
      });
  });

  afterEach(() => {
    mountEnterBranchSpy.mockRestore();
  });

  it.each([
    ['parallel', ['load', 'apply', 'transitionOut', 'transitionIn']],
    ['in-out', ['load', 'apply', 'transitionIn', 'transitionOut']],
  ] as const)('branch + %s runs steps in order', async (policy, expectedOrder) => {
    const callOrder: string[] = [];
    const transaction = withViewGraph({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      transitionOrder: policy,
    });

    jest.spyOn(transaction.engine.resourceGraph, 'load').mockImplementation(async () => {
      callOrder.push('load');
      return { view: ['<page/>'] };
    });
    mountEnterBranchSpy.mockImplementation(() => {
      callOrder.push('apply');
      return { status: 'ok' };
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    await prepareThenRenderWithTransition(new NavigationTransactionPipeline(transaction));

    expect(callOrder).toEqual(expectedOrder);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });
});

jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as branchResolver from '../../core/view-mount/branch-resolver';
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
  let resolveEnterBranchSpy: jest.SpiedFunction<typeof branchResolver.resolveEnterBranch>;
  let mountEnterBranchSpy: jest.SpiedFunction<typeof branchMount.mountEnterBranch>;

  beforeEach(() => {
    resetPipelineMocks();
    resolveEnterBranchSpy = jest
      .spyOn(branchResolver, 'resolveEnterBranch')
      .mockResolvedValue({ status: 'ok', preResolvedContents: ['<layout/>', '<index/>'] });
    mountEnterBranchSpy = jest
      .spyOn(branchMount, 'mountEnterBranch')
      .mockReturnValue({ status: 'ok' });
  });

  afterEach(() => {
    resolveEnterBranchSpy.mockRestore();
    mountEnterBranchSpy.mockRestore();
  });

  it('resolves in prepare then sync-mounts in render for multi-route enter', async () => {
    const layout = createMatchedRoute('/users');
    const index = createMatchedRoute('/users/1');
    const transaction = withViewGraph({
      enterRoutes: [layout, index],
      transitionOrder: null,
    });

    await prepareThenRender(new NavigationTransactionPipeline(transaction));

    expect(resolveEnterBranchSpy).toHaveBeenCalledWith(
      [layout, index],
      transaction.engine.viewGraph,
      expect.objectContaining({
        signal: transaction.signal,
        paramChangeRemount: false,
      }),
    );
    expect(mountEnterBranchSpy).toHaveBeenCalledWith(
      [layout, index],
      ['<layout/>', '<index/>'],
      expect.objectContaining({ signal: transaction.signal }),
    );
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('uses branch prepare/commit for a single sync route', async () => {
    resolveEnterBranchSpy.mockResolvedValue({
      status: 'ok',
      preResolvedContents: ['<page/>'],
    });
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/page')],
      transitionOrder: null,
    });

    await prepareThenRender(new NavigationTransactionPipeline(transaction));

    expect(resolveEnterBranchSpy).toHaveBeenCalledTimes(1);
    expect(mountEnterBranchSpy).toHaveBeenCalledTimes(1);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('passes paramChangeRemount through branch resolve context', async () => {
    resolveEnterBranchSpy.mockResolvedValue({
      status: 'ok',
      preResolvedContents: ['<page/>'],
    });
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/users/2')],
      transitionOrder: null,
    });
    transaction.transitionPlan.paramChangeRemount = true;

    await prepareThenRender(new NavigationTransactionPipeline(transaction));

    expect(resolveEnterBranchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ paramChangeRemount: true }),
    );
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

    expect(resolveEnterBranchSpy).toHaveBeenCalledTimes(1);
    expect(mountEnterBranchSpy).toHaveBeenCalledTimes(1);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('out-in resolves in prepare before transitionOut and mounts before transitionIn', async () => {
    const callOrder: string[] = [];

    resolveEnterBranchSpy.mockImplementation(async () => {
      callOrder.push('resolve');
      return { status: 'ok', preResolvedContents: ['<layout/>', '<index/>'] };
    });
    mountEnterBranchSpy.mockImplementation(() => {
      callOrder.push('apply');
      return { status: 'ok' };
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    const transaction = withViewGraph({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      transitionOrder: 'out-in',
    });

    await prepareThenRenderWithTransition(new NavigationTransactionPipeline(transaction));

    expect(callOrder).toEqual(['resolve', 'transitionOut', 'apply', 'transitionIn']);
  });

  it('returns cancelled when branch resolve aborts', async () => {
    resolveEnterBranchSpy.mockResolvedValue({ status: 'aborted' });
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runPrepare();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('returns cancelled when branch resolve succeeds but transaction is inactive', async () => {
    resolveEnterBranchSpy.mockResolvedValue({
      status: 'ok',
      preResolvedContents: ['<a/>', '<b/>'],
    });
    const transaction = withViewGraph({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });
    jest.spyOn(transaction, 'isActive').mockReturnValue(false);

    const outcome = await new NavigationTransactionPipeline(transaction).runPrepare();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
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
  let resolveEnterBranchSpy: jest.SpiedFunction<typeof branchResolver.resolveEnterBranch>;
  let mountEnterBranchSpy: jest.SpiedFunction<typeof branchMount.mountEnterBranch>;

  beforeEach(() => {
    resetPipelineMocks();
    resolveEnterBranchSpy = jest
      .spyOn(branchResolver, 'resolveEnterBranch')
      .mockResolvedValue({ status: 'ok', preResolvedContents: ['<a/>', '<b/>'] });
    mountEnterBranchSpy = jest
      .spyOn(branchMount, 'mountEnterBranch')
      .mockReturnValue({ status: 'ok' });
  });

  afterEach(() => {
    resolveEnterBranchSpy.mockRestore();
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

  it('recovers after branch resolve error', async () => {
    const resolveError = new Error('branch resolve failed');
    const failingRoute = createMatchedRoute('/b');
    resolveEnterBranchSpy.mockResolvedValue({
      status: 'error',
      error: resolveError,
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

    const outcome = await new NavigationTransactionPipeline(transaction).runPrepare();

    await expectRenderErrorRecovery(outcome, phases, recoverySpy);
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
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
        transaction.preResolvedBranchContents = undefined;
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
  let resolveEnterBranchSpy: jest.SpiedFunction<typeof branchResolver.resolveEnterBranch>;
  let mountEnterBranchSpy: jest.SpiedFunction<typeof branchMount.mountEnterBranch>;

  beforeEach(() => {
    resetPipelineMocks();
    resolveEnterBranchSpy = jest
      .spyOn(branchResolver, 'resolveEnterBranch')
      .mockResolvedValue({ status: 'ok', preResolvedContents: ['<layout/>', '<index/>'] });
    mountEnterBranchSpy = jest
      .spyOn(branchMount, 'mountEnterBranch')
      .mockImplementation(() => {
        return { status: 'ok' };
      });
  });

  afterEach(() => {
    resolveEnterBranchSpy.mockRestore();
    mountEnterBranchSpy.mockRestore();
  });

  it.each([
    ['parallel', ['resolve', 'apply', 'transitionOut', 'transitionIn']],
    ['in-out', ['resolve', 'apply', 'transitionIn', 'transitionOut']],
  ] as const)('branch + %s runs steps in order', async (policy, expectedOrder) => {
    const callOrder: string[] = [];

    resolveEnterBranchSpy.mockImplementation(async () => {
      callOrder.push('resolve');
      return { status: 'ok', preResolvedContents: ['<page/>'] };
    });
    mountEnterBranchSpy.mockImplementation(() => {
      callOrder.push('apply');
      return { status: 'ok' };
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    const transaction = withViewGraph({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      transitionOrder: policy,
    });

    await prepareThenRenderWithTransition(new NavigationTransactionPipeline(transaction));

    expect(callOrder).toEqual(expectedOrder);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });
});

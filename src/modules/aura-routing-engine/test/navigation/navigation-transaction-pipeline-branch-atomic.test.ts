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
  withContentLoad,
} from '../helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline branch-atomic render', () => {
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

  it('resolves branch then sync-mounts pre-resolved contents for multi-route enter', async () => {
    const layout = createMatchedRoute('/users');
    const index = createMatchedRoute('/users/1');
    const transaction = withContentLoad({
      enterRoutes: [layout, index],
      transitionOrder: null,
    });

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(resolveEnterBranchSpy).toHaveBeenCalledWith(
      [layout, index],
      transaction.engine.contentLoad,
      expect.objectContaining({ signal: transaction.signal }),
    );
    expect(mountEnterBranchSpy).toHaveBeenCalledWith(
      [layout, index],
      ['<layout/>', '<index/>'],
      expect.objectContaining({ signal: transaction.signal }),
    );
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('uses eager per-route render for a single sync route', async () => {
    const transaction = withContentLoad({
      enterRoutes: [createMatchedRoute('/page')],
      transitionOrder: null,
    });

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(resolveEnterBranchSpy).not.toHaveBeenCalled();
    expect(mockRunViewCommit).toHaveBeenCalledTimes(1);
    expect(mockRunViewCommit).toHaveBeenCalledWith(
      transaction.transitionPlan.enterRoutes[0],
      expect.objectContaining({ isAborted: expect.any(Function) }),
      undefined,
    );
  });

  it('renders every enter route when mount-strategy is per-route', async () => {
    const layout = createMatchedRoute('/users', { mountStrategy: 'per-route' });
    const index = createMatchedRoute('/users/1', { mountStrategy: 'per-route' });
    const transaction = withContentLoad({
      enterRoutes: [layout, index],
      transitionOrder: null,
    });

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(mockRunViewCommit).toHaveBeenCalledTimes(2);
    expect(mockRunViewCommit).toHaveBeenNthCalledWith(
      1,
      layout,
      expect.objectContaining({ isAborted: expect.any(Function) }),
      undefined,
    );
    expect(mockRunViewCommit).toHaveBeenNthCalledWith(
      2,
      index,
      expect.objectContaining({ isAborted: expect.any(Function) }),
      undefined,
    );
    expect(resolveEnterBranchSpy).not.toHaveBeenCalled();
  });

  it('uses branch atomic with transition order on multi-route enter', async () => {
    const transaction = withContentLoad({
      enterRoutes: [createMatchedRoute('/users'), createMatchedRoute('/users/1')],
      transitionOrder: 'out-in',
    });

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(resolveEnterBranchSpy).toHaveBeenCalledTimes(1);
    expect(mountEnterBranchSpy).toHaveBeenCalledTimes(1);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('out-in branch atomic resolves before transitionOut and mounts before transitionIn', async () => {
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

    const transaction = withContentLoad({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      transitionOrder: 'out-in',
    });

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(callOrder).toEqual(['resolve', 'transitionOut', 'apply', 'transitionIn']);
  });

  it('returns cancelled when branch resolve aborts', async () => {
    resolveEnterBranchSpy.mockResolvedValue({ status: 'aborted' });
    const transaction = withContentLoad({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('returns cancelled when branch resolve succeeds but transaction is inactive', async () => {
    resolveEnterBranchSpy.mockResolvedValue({
      status: 'ok',
      preResolvedContents: ['<a/>', '<b/>'],
    });
    const transaction = withContentLoad({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });
    jest.spyOn(transaction, 'isActive').mockReturnValue(false);

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
  });

  it('returns cancelled when branch mount succeeds but transaction is inactive', async () => {
    const transaction = withContentLoad({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });
    let active = true;
    jest.spyOn(transaction, 'isActive').mockImplementation(() => active);
    mountEnterBranchSpy.mockImplementation(() => {
      active = false;
      return { status: 'ok' };
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    expect(outcome).toEqual({ status: 'cancelled' });
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

  it('recovers after per-route render error', async () => {
    const renderError = new Error('per-route render failed');
    mockRunViewCommit.mockResolvedValue({ status: 'error', error: renderError });

    const { phases } = trackLifecyclePhases();
    const transaction = withContentLoad({
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/to', { mountStrategy: 'per-route' })],
      transitionOrder: null,
    });
    const recoverySpy = jest.spyOn(
      transaction.viewCommitTracker,
      'markViewCommittedAfterErrorRecovery',
    );

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    await expectRenderErrorRecovery(outcome, phases, recoverySpy);
    expect(resolveEnterBranchSpy).not.toHaveBeenCalled();
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
    const transaction = withContentLoad({
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/a'), failingRoute],
      transitionOrder: null,
    });
    const recoverySpy = jest.spyOn(
      transaction.viewCommitTracker,
      'markViewCommittedAfterErrorRecovery',
    );

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    await expectRenderErrorRecovery(outcome, phases, recoverySpy);
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
  });

  it('recovers after branch mount error', async () => {
    const mountError = new Error('branch mount failed');
    const failingRoute = createMatchedRoute('/b');
    mountEnterBranchSpy.mockReturnValue({
      status: 'error',
      error: mountError,
      route: failingRoute,
    });

    const { phases } = trackLifecyclePhases();
    const transaction = withContentLoad({
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/a'), failingRoute],
      transitionOrder: null,
    });
    const recoverySpy = jest.spyOn(
      transaction.viewCommitTracker,
      'markViewCommittedAfterErrorRecovery',
    );

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    await expectRenderErrorRecovery(outcome, phases, recoverySpy);
  });

  it('returns cancelled when branch mount aborts mid-apply', async () => {
    mountEnterBranchSpy.mockReturnValue({ status: 'aborted' });

    const transaction = withContentLoad({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('returns cancelled when branch contents are lost before commit', async () => {
    const transaction = withContentLoad({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: 'out-in',
    });

    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'transitionOut') {
        transaction.preResolvedBranchContents = undefined;
      }
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
  });
});

describe('NavigationTransactionPipeline branch-atomic transition matrix gaps', () => {
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
  ] as const)('atomic + %s runs steps in order', async (policy, expectedOrder) => {
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

    const transaction = withContentLoad({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      transitionOrder: policy,
    });

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(callOrder).toEqual(expectedOrder);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });
});

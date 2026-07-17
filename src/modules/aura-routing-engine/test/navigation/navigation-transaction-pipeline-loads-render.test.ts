jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { PHASES } from '../../core/navigation/lifecycle-phases';
import type { DataSnapshot } from '../../core/data-graph';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as branchMount from '../../core/view-mount/branch-mount';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline phase hook attrs', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('runs hooks from phase attrs on matching phase', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const transaction = createMockTransaction({
      transitionOrder: null,
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade-in'] })],
    });

    await new NavigationTransactionPipeline(transaction).runLifecyclePhase(PHASES.unmount);

    expect(phases).toEqual(['unmount']);
  });
});

describe('NavigationTransactionPipeline branch mount data', () => {
  let mountEnterBranchSpy: jest.SpiedFunction<typeof branchMount.mountEnterBranch>;

  beforeEach(() => {
    resetPipelineMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mountEnterBranchSpy = jest
      .spyOn(branchMount, 'mountEnterBranch')
      .mockReturnValue({ status: 'ok' });
  });

  afterEach(() => {
    mountEnterBranchSpy.mockRestore();
  });

  it('passes load-hook data from dataSnapshot via branch resolve context', async () => {
    const enterRoute = createMatchedRoute('/to', {
      load: ['fetch'],
      hasLoad: true,
    });
    const loadPayload = { items: [1, 2] };
    const snapshot = new Map([
      [enterRoute.dataKey!, loadPayload],
    ]) as DataSnapshot;

    const transaction = createMockTransaction({
      enterRoutes: [enterRoute],
      transitionOrder: null,
    });
    transaction.dataSnapshot = snapshot;
    transaction.preResolvedBranchContents = ['<page/>'];

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(mountEnterBranchSpy).toHaveBeenCalledWith(
      [enterRoute],
      ['<page/>'],
      expect.objectContaining({
        dataFor: expect.any(Function),
      }),
    );
    const ctx = mountEnterBranchSpy.mock.calls[0]![2]!;
    expect(ctx.dataFor?.(enterRoute)).toEqual(loadPayload);
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });
});

describe('NavigationTransactionPipeline.runLoads activeChain', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('prefers to.chain over enterRoutes when calling DataGraph.load', async () => {
    const parent = createMatchedRoute('/users');
    const child = createMatchedRoute('/users/1');
    const branch = [parent, child];

    const transaction = createMockTransaction({
      enterRoutes: [child],
      transitionOrder: null,
    });
    transaction.to = { ...child, chain: branch };

    const loadSpy = jest
      .spyOn(transaction.engine.dataGraph, 'load')
      .mockResolvedValue({});

    await new NavigationTransactionPipeline(transaction).runLoads();

    expect(loadSpy).toHaveBeenCalledWith(
      [child],
      expect.objectContaining({ branch, transaction, mode: 'navigation' }),
    );

    loadSpy.mockRestore();
  });
});

describe('NavigationTransactionPipeline branch render cancellation', () => {
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

  it('passes live isActive check to branch resolve context during commit', async () => {
    mountEnterBranchSpy.mockImplementation((_routes, _contents, ctx) => {
      expect(ctx.aborted()).toBe(false);
      return { status: 'ok' };
    });

    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/page')],
      transitionOrder: null,
    });
    transaction.preResolvedBranchContents = ['<page/>'];

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(mountEnterBranchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns cancelled when superseded during branch mount', async () => {
    let active = true;
    mountEnterBranchSpy.mockImplementation(() => {
      active = false;
      return { status: 'ok' };
    });

    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
      transitionOrder: null,
    });
    transaction.preResolvedBranchContents = ['<a/>', '<b/>'];
    jest.spyOn(transaction, 'isActive').mockImplementation(() => active);

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).toHaveBeenCalledTimes(1);
  });
});

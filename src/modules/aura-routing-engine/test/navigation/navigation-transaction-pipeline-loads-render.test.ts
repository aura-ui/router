jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../_helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  jest.requireActual('../_helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { PHASES } from '../../core/navigation/lifecycle-phases';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as branchMount from '../../core/view-mount/branch-mount';
import { createMatchedRoute, createMockTransaction, asViewSnapshot } from '../_helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../_helpers/jest/pipeline-mocks';
import type { DataSnapshot } from '../../core/data-graph';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';

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

  it('passes dataSnapshot to branch mount', async () => {
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
    transaction.viewSnapshot = asViewSnapshot('<page/>');

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(mountEnterBranchSpy).toHaveBeenCalledWith(
      [enterRoute],
      asViewSnapshot('<page/>'),
      expect.objectContaining({ dataSnapshot: snapshot }),
    );
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });
});

describe('NavigationTransactionPipeline.runLoads activeChain', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('prefers to.chain over enterRoutes when calling ResourceGraph.load', async () => {
    const parent = createMatchedRoute('/users');
    const child = createMatchedRoute('/users/1');
    const branch = [parent, child];

    const transaction = createMockTransaction({
      enterRoutes: [child],
      transitionOrder: null,
    });
    (transaction as { to: MatchedRouteInfo }).to = { ...child, chain: branch };

    const loadSpy = jest
      .spyOn(transaction.engine.resourceGraph, 'load')
      .mockResolvedValue({});

    await new NavigationTransactionPipeline(transaction).runLoads();

    expect(loadSpy).toHaveBeenCalledWith(
      [child],
      expect.objectContaining({ branch, transaction }),
    );

    loadSpy.mockRestore();
  });

  it('wraps ResourceGraph.load with showLoading / hideLoading', async () => {
    const order: string[] = [];
    const enter = createMatchedRoute('/to', {
      showLoading: () => {
        order.push('show');
      },
      hideLoading: () => {
        order.push('hide');
      },
    });

    const transaction = createMockTransaction({
      enterRoutes: [enter],
      transitionOrder: null,
    });

    jest.spyOn(transaction.engine.resourceGraph, 'load').mockImplementation(async () => {
      order.push('load');
      return {};
    });

    await new NavigationTransactionPipeline(transaction).runLoads();

    expect(order).toEqual(['show', 'load', 'hide']);
  });

  it('calls hideLoading when ResourceGraph.load throws', async () => {
    const hideLoading = jest.fn();
    const enter = createMatchedRoute('/to', {
      showLoading: jest.fn(),
      hideLoading,
    });

    const transaction = createMockTransaction({
      enterRoutes: [enter],
      transitionOrder: null,
    });

    jest.spyOn(transaction.engine.resourceGraph, 'load').mockRejectedValue(new Error('boom'));

    await expect(new NavigationTransactionPipeline(transaction).runLoads()).rejects.toThrow('boom');
    expect(hideLoading).toHaveBeenCalledTimes(1);
  });

  it('runSpeculativePrepare (prefetch) loads without showLoading / hideLoading', async () => {
    const showLoading = jest.fn();
    const hideLoading = jest.fn();
    const enter = createMatchedRoute('/to', { showLoading, hideLoading });

    const transaction = createMockTransaction({
      enterRoutes: [enter],
      transitionOrder: null,
    });

    const loadSpy = jest
      .spyOn(transaction.engine.resourceGraph, 'load')
      .mockResolvedValue({});

    await new NavigationTransactionPipeline(transaction).runSpeculativePrepare();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(showLoading).not.toHaveBeenCalled();
    expect(hideLoading).not.toHaveBeenCalled();
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
    transaction.viewSnapshot = asViewSnapshot('<page/>');

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
    transaction.viewSnapshot = asViewSnapshot('<a/>', '<b/>');
    jest.spyOn(transaction, 'isActive').mockImplementation(() => active);

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mountEnterBranchSpy).toHaveBeenCalledTimes(1);
  });
});

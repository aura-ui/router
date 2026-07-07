jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline.runAfterRender', () => {
  beforeEach(() => {
    resetPipelineMocks();
    mockRunViewCommit.mockResolvedValue('ok');
  });

  it('runs left then after', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const transaction = createMockTransaction({
      transitionOrder: null,
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/to', { ready: ['analytics'] })],
    });
    transaction.viewCommitTracker.markViewStaged();

    await new NavigationTransactionPipeline(transaction).runAfterRender();

    expect(phases).toEqual(['unmount', 'ready']);
  });

  it('runs onUnmount during param-change remount unmount phase', async () => {
    const phases: string[] = [];
    const onUnmount = jest.fn();
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const exitRoute = createMatchedRoute('/users/:id', { unmount: ['cleanup'], ready: ['analytics'] });
    exitRoute.params = { id: '1' };
    exitRoute.route.onUnmount = onUnmount;
    const enterRoute = createMatchedRoute('/users/:id', { unmount: ['cleanup'], ready: ['analytics'] });
    enterRoute.params = { id: '2' };

    const transaction = createMockTransaction({
      transitionOrder: null,
      exitRoutes: [exitRoute],
      enterRoutes: [enterRoute],
    });
    transaction.transitionPlan.paramChangeRemount = true;
    transaction.viewCommitTracker.markViewStaged();

    await new NavigationTransactionPipeline(transaction).runAfterRender();

    expect(onUnmount).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(['unmount', 'ready']);
  });

  it('runs unmount before commitStagedView on param-change remount', async () => {
    const callOrder: string[] = [];
    const onUnmount = jest.fn(() => callOrder.push('unmount'));
    const commitStagedView = jest.fn(() => callOrder.push('commit'));

    const exitRoute = createMatchedRoute('/users/:id', { unmount: ['cleanup'] });
    exitRoute.params = { id: '1' };
    exitRoute.route.onUnmount = onUnmount;
    const enterRoute = createMatchedRoute('/users/:id', { commitStagedView, ready: ['analytics'] });
    enterRoute.params = { id: '2' };

    const transaction = createMockTransaction({
      transitionOrder: null,
      exitRoutes: [exitRoute],
      enterRoutes: [enterRoute],
    });
    transaction.transitionPlan.paramChangeRemount = true;
    transaction.viewCommitTracker.markViewStaged();

    await new NavigationTransactionPipeline(transaction).runAfterRender();

    expect(callOrder).toEqual(['unmount', 'commit']);
  });

  it('runs unmount before commitStagedView on cross-route navigation', async () => {
    const callOrder: string[] = [];
    const onUnmount = jest.fn(() => callOrder.push('unmount'));
    const commitStagedView = jest.fn(() => callOrder.push('commitStaged'));

    const exitRoute = createMatchedRoute('/from', { unmount: ['cleanup'] });
    exitRoute.route.onUnmount = onUnmount;
    const enterRoute = createMatchedRoute('/to', { commitStagedView, ready: ['analytics'] });

    const transaction = createMockTransaction({
      transitionOrder: null,
      from: exitRoute,
      exitRoutes: [exitRoute],
      enterRoutes: [enterRoute],
    });
    transaction.viewCommitTracker.markViewStaged();

    await new NavigationTransactionPipeline(transaction).runAfterRender();

    expect(callOrder).toEqual(['unmount', 'commitStaged']);
  });

  it('runs commitNavigation after exit unmount and view promote, before ready', async () => {
    const callOrder: string[] = [];
    const onUnmount = jest.fn(() => callOrder.push('unmount'));
    const commitStagedView = jest.fn(() => callOrder.push('commitStaged'));

    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'ready') callOrder.push('ready');
    });

    const exitRoute = createMatchedRoute('/from', { unmount: ['cleanup'] });
    exitRoute.route.onUnmount = onUnmount;
    const enterRoute = createMatchedRoute('/to', { commitStagedView, ready: ['analytics'] });

    const transaction = createMockTransaction({
      transitionOrder: null,
      from: exitRoute,
      exitRoutes: [exitRoute],
      enterRoutes: [enterRoute],
    });
    transaction.viewCommitTracker.markViewStaged();

    const originalCommitNavigation = transaction.commitNavigation.bind(transaction);
    jest.spyOn(transaction, 'commitNavigation').mockImplementation(() => {
      callOrder.push('commitNavigation');
      originalCommitNavigation();
    });

    await new NavigationTransactionPipeline(transaction).runAfterRender();

    expect(callOrder).toEqual(['unmount', 'commitStaged', 'commitNavigation', 'ready']);
    expect(transaction.engine.commitNavigation).toHaveBeenCalledWith(transaction);
    expect(transaction.viewCommitTracker.isViewCommitted()).toBe(true);
  });

  it('does not promote or commit navigation when transaction is inactive after unmount', async () => {
    const commitStagedView = jest.fn();
    const transaction = createMockTransaction({
      transitionOrder: null,
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/to', { commitStagedView, ready: ['analytics'] })],
    });
    transaction.viewCommitTracker.markViewStaged();

    let activeChecks = 0;
    jest.spyOn(transaction, 'isActive').mockImplementation(() => {
      activeChecks++;
      return activeChecks === 1;
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runAfterRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(commitStagedView).not.toHaveBeenCalled();
    expect(transaction.engine.commitNavigation).not.toHaveBeenCalled();
    expect(transaction.viewCommitTracker.isViewCommitted()).toBe(false);
  });

  it('returns cancelled when transaction is inactive before unmount', async () => {
    const commitStagedView = jest.fn();
    const transaction = createMockTransaction({
      transitionOrder: null,
      enterRoutes: [createMatchedRoute('/to', { commitStagedView })],
    });
    transaction.viewCommitTracker.markViewStaged();
    jest.spyOn(transaction, 'isActive').mockReturnValue(false);

    const outcome = await new NavigationTransactionPipeline(transaction).runAfterRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(commitStagedView).not.toHaveBeenCalled();
    expect(transaction.engine.commitNavigation).not.toHaveBeenCalled();
  });
});

describe('NavigationTransactionPipeline post-render commit order (full pipeline)', () => {
  beforeEach(() => {
    resetPipelineMocks();
    mockRunViewCommit.mockResolvedValue('ok');
  });

  it('runFullPipeline finalizes exit before navigation commit gate', async () => {
    const callOrder: string[] = [];
    const onUnmount = jest.fn(() => callOrder.push('unmount'));
    const commitStagedView = jest.fn(() => callOrder.push('commitStaged'));

    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'ready') callOrder.push('ready');
    });

    const exitRoute = createMatchedRoute('/from', { unmount: ['cleanup'] });
    exitRoute.route.onUnmount = onUnmount;
    const enterRoute = createMatchedRoute('/to', { commitStagedView, ready: ['analytics'] });

    const transaction = createMockTransaction({
      transitionOrder: null,
      from: exitRoute,
      exitRoutes: [exitRoute],
      enterRoutes: [enterRoute],
    });

    const originalCommitNavigation = transaction.commitNavigation.bind(transaction);
    jest.spyOn(transaction, 'commitNavigation').mockImplementation(() => {
      callOrder.push('commitNavigation');
      originalCommitNavigation();
    });

    const result = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(callOrder).toEqual(['unmount', 'commitStaged', 'commitNavigation', 'ready']);
  });
});

describe('NavigationTransactionPipeline supersede', () => {
  beforeEach(() => {
    resetPipelineMocks();
    mockRunViewCommit.mockResolvedValue('ok');
  });

  it('runFullPipeline cancels before loads when transaction becomes inactive early', async () => {
    const commitStagedView = jest.fn();
    const transaction = createMockTransaction({
      transitionOrder: null,
      enterRoutes: [createMatchedRoute('/to', { commitStagedView })],
    });
    let activeChecks = 0;
    jest.spyOn(transaction, 'isActive').mockImplementation(() => {
      activeChecks++;
      return activeChecks === 1;
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(commitStagedView).not.toHaveBeenCalled();
    expect(transaction.viewCommitTracker.isViewCommitted()).toBe(false);
  });

  it('returns cancelled when transaction is inactive from the start', async () => {
    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to')],
      isTransactionStale: () => true,
    });

    const result = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(result).toEqual({ status: 'cancelled' });
  });
});

jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as branchMount from '../../core/view-mount/branch-mount';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline history commit', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('commits history after guard and before load and render', async () => {
    const order: string[] = [];
    const loadHook = jest.fn().mockImplementation(async () => {
      order.push('load');
      return {};
    });
    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { guard: ['auth'], load: ['fetch'] })],
      transitionOrder: null,
    });
    transaction.engine.commitHistoryIfNeeded = jest.fn(() => {
      order.push('history');
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      order.push(`hook:${ctx.phase}`);
    });
    mockRunViewCommit.mockImplementation(async () => {
      order.push('render');
      return 'ok';
    });
    transaction.engine.hooksRegistry.register({
      name: 'fetch',
      version: '1.0.0',
      fn: loadHook,
    });
    jest.spyOn(branchMount, 'mountEnterBranch').mockImplementation(() => {
      order.push('render');
      return { status: 'ok' };
    });

    await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(order.indexOf('history')).toBeGreaterThan(order.indexOf('hook:guard'));
    expect(order.indexOf('load')).toBeGreaterThan(order.indexOf('history'));
    expect(order.indexOf('render')).toBeGreaterThan(order.indexOf('load'));
    expect(transaction.engine.commitHistoryIfNeeded).toHaveBeenCalledTimes(1);

    jest.restoreAllMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('does not commit history when guard cancels', async () => {
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'guard') return false;
    });

    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { guard: ['auth'] })],
      transitionOrder: null,
    });

    const result = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(result).toEqual({ status: 'cancelled' });
    expect(transaction.engine.commitHistoryIfNeeded).not.toHaveBeenCalled();
  });

  it('keeps history committed when load fails (optimistic URL, no rollback)', async () => {
    const loadHook = jest.fn().mockRejectedValue(new Error('load failed'));
    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { load: ['fetch'] })],
      transitionOrder: null,
    });
    transaction.engine.hooksRegistry.register({
      name: 'fetch',
      version: '1.0.0',
      fn: loadHook,
    });

    const result = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(result.status).toBe('error');
    expect(transaction.engine.commitHistoryIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('does not commit history when leave cancels', async () => {
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'leave') return false;
    });

    const from = createMatchedRoute('/from', { leave: ['block'] });
    const transaction = createMockTransaction({
      from,
      exitRoutes: [from],
      enterRoutes: [createMatchedRoute('/to')],
      transitionOrder: null,
    });

    const result = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(result).toEqual({ status: 'cancelled' });
    expect(transaction.engine.commitHistoryIfNeeded).not.toHaveBeenCalled();
  });

  it('does not commit history when guard redirects', async () => {
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'guard') return '/login';
    });

    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { guard: ['auth'] })],
      transitionOrder: null,
    });

    const result = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(result).toEqual({ status: 'redirect', url: '/login' });
    expect(transaction.engine.commitHistoryIfNeeded).not.toHaveBeenCalled();
  });
});

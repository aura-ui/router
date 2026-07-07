jest.mock('../../core/hooks/registry', () => ({
  ...jest.requireActual('../../core/hooks/registry'),
  runPhaseHooks: jest.fn(),
}));

jest.mock('../../core/view-mount/view-commit-render', () => ({
  ...jest.requireActual('../../core/view-mount/view-commit-render'),
  runViewCommit: jest.fn(),
}));

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as branchResolver from '../../core/view-mount/branch-resolver';
import * as branchMount from '../../core/view-mount/branch-mount';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from './pipeline-test-setup';

describe('NavigationTransactionPipeline history commit', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('commits history after load and before render', async () => {
    const order: string[] = [];
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
    jest.spyOn(branchResolver, 'resolveEnterBranch').mockResolvedValue({ status: 'ok', preResolvedContents: [null] });
    jest.spyOn(branchMount, 'mountEnterBranch').mockImplementation(() => {
      order.push('render');
      return { status: 'ok' };
    });

    await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(order.indexOf('history')).toBeGreaterThan(order.indexOf('hook:guard'));
    expect(order.indexOf('history')).toBeGreaterThan(order.indexOf('hook:load'));
    expect(order.indexOf('render')).toBeGreaterThan(order.indexOf('history'));
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

  it('does not commit history when load fails', async () => {
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
    expect(transaction.engine.commitHistoryIfNeeded).not.toHaveBeenCalled();
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

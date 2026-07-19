jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  jest.requireActual('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
import { createUsersIdMatch, createUsersIdNode } from '../helpers/create-dynamic-leaf-match';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { mockRunPhaseHooks, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline.runUpdate', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('runs load then update, not ready', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { update: ['sync'], ready: ['analytics'] })],
      update: true,
    });

    await new NavigationTransactionPipeline(transaction).runUpdate();

    expect(phases).toEqual(['update']);
    expect(transaction.engine.commitHistoryIfNeeded).toHaveBeenCalledWith(transaction);
    expect(transaction.engine.commitNavigation).toHaveBeenCalledWith(transaction);
  });

  it('commits history before load and update', async () => {
    const order: string[] = [];
    const loadHook = jest.fn().mockImplementation(async () => {
      order.push('load');
      return {};
    });
    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { load: ['fetch'], update: ['sync'] })],
      update: true,
    });
    transaction.engine.commitHistoryIfNeeded = jest.fn(() => {
      order.push('history');
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      order.push(`hook:${ctx.phase}`);
    });
    transaction.engine.hooksRegistry.register({
      name: 'fetch',
      version: '1.0.0',
      fn: loadHook,
    });

    await new NavigationTransactionPipeline(transaction).runUpdate();

    expect(order.indexOf('history')).toBeLessThan(order.indexOf('load'));
    expect(order.indexOf('hook:update')).toBeGreaterThan(order.indexOf('history'));
    expect(transaction.engine.commitHistoryIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('keeps history committed when load fails on update (optimistic URL, no rollback)', async () => {
    const loadHook = jest.fn().mockRejectedValue(new Error('load failed'));
    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { load: ['fetch'], update: ['sync'] })],
      update: true,
    });
    transaction.engine.hooksRegistry.register({
      name: 'fetch',
      version: '1.0.0',
      fn: loadHook,
    });

    const result = await new NavigationTransactionPipeline(transaction).runUpdate();

    expect(result.status).toBe('error');
    expect(transaction.engine.commitHistoryIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('runs DataGraph load before update when route declares load hooks', async () => {
    const loadHook = jest.fn().mockResolvedValue({ items: [] });
    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { load: ['fetch-list'], update: ['sync'] })],
      update: true,
    });
    transaction.engine.hooksRegistry.register({
      name: 'fetch-list',
      version: '1.0.0',
      fn: loadHook,
    });

    await new NavigationTransactionPipeline(transaction).runUpdate();

    expect(loadHook).toHaveBeenCalledTimes(1);
    expect(loadHook.mock.calls[0]![0].phase).toBe('load');
    expect(transaction.engine.commitNavigation).toHaveBeenCalledWith(transaction);
  });

  it('runs load + update + commit when buildTransitionPlan detects param change', async () => {
    const loadHook = jest.fn().mockResolvedValue({ userId: '2' });
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const node = createUsersIdNode({ load: ['fetch-user'], update: ['sync-user'] });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);
    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(true);
    expect(plan.enterRoutes[0]!.params).toEqual({ id: '2' });

    const transaction = createMockTransaction({
      from,
      enterRoutes: plan.enterRoutes,
      exitRoutes: plan.exitRoutes,
      update: plan.update,
    });
    transaction.to = to;
    transaction.transitionPlan = plan;
    transaction.engine.hooksRegistry.register({
      name: 'fetch-user',
      version: '1.0.0',
      fn: loadHook,
    });

    await new NavigationTransactionPipeline(transaction).runUpdate();

    expect(loadHook).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(['update']);
    expect(transaction.engine.commitNavigation).toHaveBeenCalledWith(transaction);
  });
});

describe('NavigationTransactionPipeline.runUpdate cancellation', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('returns cancelled when inactive after update phase', async () => {
    let active = true;
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'update') active = false;
    });

    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/to', { update: ['sync'] })],
      update: true,
    });
    jest.spyOn(transaction, 'isActive').mockImplementation(() => active);

    const result = await new NavigationTransactionPipeline(transaction).runUpdate();

    expect(result).toEqual({ status: 'cancelled' });
    expect(transaction.engine.commitNavigation).not.toHaveBeenCalled();
  });
});

import type { RouteInstance } from '../../core';
import { runPhaseHooks } from '../../core/hooks/registry';
import { PHASES } from '../../core/lifecycle';
import { NavigationTransactionPipelinePhase } from '../../core/navigation/navigation-transaction-pipeline-phase';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { runViewCommit } from '../../core/view-mount/view-commit-render';
import {
  createMatchedRoute,
  createMockTransaction,
} from '../helpers/create-mock-transaction';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
import { createUsersIdMatch, createUsersIdNode } from '../helpers/create-dynamic-leaf-match';

jest.mock('../../core/hooks/registry', () => ({
  ...jest.requireActual('../../core/hooks/registry'),
  runPhaseHooks: jest.fn(),
}));

jest.mock('../../core/view-mount/view-commit-render', () => ({
  ...jest.requireActual('../../core/view-mount/view-commit-render'),
  runViewCommit: jest.fn(),
}));

const mockRunPhaseHooks = runPhaseHooks as jest.MockedFunction<typeof runPhaseHooks>;
const mockRunViewCommit = runViewCommit as jest.MockedFunction<typeof runViewCommit>;

describe('NavigationTransactionPipelinePhase.resolveBlockingHookOutcome', () => {
  it('returns cancelled when hook returns false', () => {
    expect(NavigationTransactionPipelinePhase.resolveBlockingHookOutcome(false)).toEqual({
      status: 'cancelled',
    });
  });

  it('returns redirect when hook returns a URL string', () => {
    expect(NavigationTransactionPipelinePhase.resolveBlockingHookOutcome('/login')).toEqual({
      status: 'redirect',
      url: '/login',
    });
  });

  it('returns redirect with replace when hook returns redirect object', () => {
    expect(
      NavigationTransactionPipelinePhase.resolveBlockingHookOutcome({ url: '/login', replace: true }),
    ).toEqual({ status: 'redirect', url: '/login', replace: true });
  });

  it('returns null when hook allows navigation to continue', () => {
    expect(NavigationTransactionPipelinePhase.resolveBlockingHookOutcome(undefined)).toBeNull();
  });
});

describe('NavigationTransactionPipeline history commit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mockRunPhaseHooks.mockResolvedValue(undefined);
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

    await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(order.indexOf('history')).toBeGreaterThan(order.indexOf('hook:guard'));
    expect(order.indexOf('history')).toBeGreaterThan(order.indexOf('hook:load'));
    expect(order.indexOf('render')).toBeGreaterThan(order.indexOf('history'));
    expect(transaction.engine.commitHistoryIfNeeded).toHaveBeenCalledTimes(1);
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

describe('NavigationTransactionPipeline.runRenderWithTransition (parallel)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('cancels before transitions when view commit is aborted', async () => {
    mockRunViewCommit.mockResolvedValue('aborted');

    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });
    const pipeline = new NavigationTransactionPipeline(transaction);

    const outcome = await pipeline.runRenderWithTransition();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mockRunPhaseHooks).not.toHaveBeenCalled();
  });

  it('runs render before parallel transition hooks', async () => {
    const callOrder: string[] = [];

    mockRunViewCommit.mockImplementation(async () => {
      callOrder.push('render');
      return 'ok';
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(callOrder[0]).toBe('render');
    expect(callOrder).toContain('transitionOut');
    expect(callOrder).toContain('transitionIn');
  });

  it('returns navigationSucceeded when render and both transitions succeed', async () => {
    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toBeNull();
  });

  it('cancels before committing when superseded after parallel transitions', async () => {
    const commitStagedView = jest.fn();
    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'], commitStagedView })],
    });
    let active = true;
    jest.spyOn(transaction, 'isActive').mockImplementation(() => active);
    mockRunPhaseHooks.mockImplementation(async () => {
      active = false;
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(commitStagedView).not.toHaveBeenCalled();
  });

  it('returns error from exit transition when it fails', async () => {
    const transitionError = new Error('exit transition failed');
    const transaction = createMockTransaction({
      exitRoutes: [
        createMatchedRoute('/from', {
          transitionOut: ['fade'],
          onTransitionOut: () => {
            throw transitionError;
          },
        }),
      ],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toEqual({
      status: 'error',
      failure: expect.objectContaining({
        error: expect.objectContaining({
          code: 'TRANSITION_FAILED',
          message: 'exit transition failed',
        }),
        commit: { view: 'staged', href: '/to' },
      }),
    });
  });

  it('prefers exit transition error over enter transition error', async () => {
    const exitError = new Error('exit failed');
    const enterError = new Error('enter failed');
    const transaction = createMockTransaction({
      exitRoutes: [
        createMatchedRoute('/from', {
          transitionOut: ['fade'],
          onTransitionOut: () => {
            throw exitError;
          },
        }),
      ],
      enterRoutes: [
        createMatchedRoute('/to', {
          transitionIn: ['fade'],
          onTransitionIn: () => {
            throw enterError;
          },
        }),
      ],
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toEqual({
      status: 'error',
      failure: expect.objectContaining({
        error: expect.objectContaining({
          code: 'TRANSITION_FAILED',
          message: 'exit failed',
        }),
        commit: { view: 'staged', href: '/to' },
      }),
    });
  });
});

describe('NavigationTransactionPipeline sequential transition policies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it.each([
    ['out-in', ['transitionOut', 'render', 'transitionIn']],
    ['in-out', ['render', 'transitionIn', 'transitionOut']],
  ] as const)('runs %s steps in order', async (policy, expectedOrder) => {
    const callOrder: string[] = [];

    mockRunViewCommit.mockImplementation(async () => {
      callOrder.push('render');
      return 'ok';
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    const transaction = createMockTransaction({
      transitionOrder: policy,
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(callOrder).toEqual(expectedOrder);
  });
});

describe('NavigationTransactionPipeline.runAfterRender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
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
});

describe('NavigationTransactionPipeline supersede', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('runAfterRender skips commit when transaction is no longer active', async () => {
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

describe('NavigationTransactionPipeline.runUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
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

  it('commits history after load and before update', async () => {
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

    expect(order.indexOf('history')).toBeGreaterThan(order.indexOf('load'));
    expect(order.indexOf('hook:update')).toBeGreaterThan(order.indexOf('history'));
    expect(transaction.engine.commitHistoryIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('does not commit history when load fails on update', async () => {
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
    expect(transaction.engine.commitHistoryIfNeeded).not.toHaveBeenCalled();
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

describe('NavigationTransactionPipeline phase hook attrs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
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

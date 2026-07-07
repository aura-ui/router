jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline.runRenderWithTransition (parallel)', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('cancels before transitions when view commit is aborted', async () => {
    mockRunViewCommit.mockResolvedValue('aborted');

    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'], mountStrategy: 'per-route' })],
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

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
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'], mountStrategy: 'per-route' })],
    });

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(callOrder[0]).toBe('render');
    expect(callOrder).toContain('transitionOut');
    expect(callOrder).toContain('transitionIn');
  });

  it('returns navigationSucceeded when render and both transitions succeed', async () => {
    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'], mountStrategy: 'per-route' })],
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toBeNull();
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
    resetPipelineMocks();
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
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'], mountStrategy: 'per-route' })],
    });

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(callOrder).toEqual(expectedOrder);
  });
});

describe('NavigationTransactionPipeline in-place param remount + transition', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('parallel: transitions run after render, unmount runs before commitStaged', async () => {
    const callOrder: string[] = [];
    mockRunViewCommit.mockImplementation(async () => {
      callOrder.push('render');
      return 'ok';
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    const onUnmount = jest.fn(() => callOrder.push('routeOnUnmount'));
    const commitStagedView = jest.fn(() => callOrder.push('commitStaged'));

    const exitRoute = createMatchedRoute('/users/:id', {
      transition: { order: 'parallel', in: ['fade-in'], out: ['fade-out'] },
      transitionIn: ['fade-in'],
      transitionOut: ['fade-out'],
      onUnmount,
    });
    exitRoute.params = { id: '1' };
    const enterRoute = createMatchedRoute('/users/:id', {
      transition: { order: 'parallel', in: ['fade-in'], out: ['fade-out'] },
      transitionIn: ['fade-in'],
      transitionOut: ['fade-out'],
      commitStagedView,
    });
    enterRoute.params = { id: '2' };

    const transaction = createMockTransaction({
      transitionOrder: 'parallel',
      exitRoutes: [exitRoute],
      enterRoutes: [enterRoute],
    });
    transaction.transitionPlan.paramChangeRemount = true;

    await new NavigationTransactionPipeline(transaction).runFullPipeline();

    const renderIdx = callOrder.indexOf('render');
    expect(renderIdx).toBeGreaterThan(-1);
    expect(callOrder.indexOf('transitionOut')).toBeGreaterThan(renderIdx);
    expect(callOrder.indexOf('transitionIn')).toBeGreaterThan(renderIdx);
    expect(callOrder.indexOf('routeOnUnmount')).toBeGreaterThan(callOrder.indexOf('transitionIn'));
    expect(callOrder.indexOf('commitStaged')).toBeGreaterThan(callOrder.indexOf('routeOnUnmount'));
    expect(callOrder.indexOf('ready')).toBeGreaterThan(callOrder.indexOf('commitStaged'));
    expect(onUnmount).toHaveBeenCalledTimes(1);
    expect(commitStagedView).toHaveBeenCalledTimes(1);
  });

  it('out-in: transitionOut before render on same leaf param remount', async () => {
    const callOrder: string[] = [];
    mockRunViewCommit.mockImplementation(async () => {
      callOrder.push('render');
      return 'ok';
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    const exitRoute = createMatchedRoute('/users/:id', {
      transition: { order: 'out-in', in: ['fade-in'], out: ['fade-out'] },
      transitionOut: ['fade-out'],
    });
    exitRoute.params = { id: '1' };
    const enterRoute = createMatchedRoute('/users/:id', {
      transition: { order: 'out-in', in: ['fade-in'], out: ['fade-out'] },
      transitionIn: ['fade-in'],
    });
    enterRoute.params = { id: '2' };

    const transaction = createMockTransaction({
      transitionOrder: 'out-in',
      exitRoutes: [exitRoute],
      enterRoutes: [enterRoute],
    });
    transaction.transitionPlan.paramChangeRemount = true;

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(callOrder).toEqual(['transitionOut', 'render', 'transitionIn']);
  });
});

describe('NavigationTransactionPipeline parallel transition edge cases', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('returns cancelled when inactive after parallel transitions finish', async () => {
    const parallelPhases = new Set<string>();
    let active = true;

    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      if (ctx.phase === 'transitionOut' || ctx.phase === 'transitionIn') {
        parallelPhases.add(ctx.phase);
        if (parallelPhases.size === 2) active = false;
      }
    });

    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'], mountStrategy: 'per-route' })],
    });
    jest.spyOn(transaction, 'isActive').mockImplementation(() => active);

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('returns enter transition error when exit transition succeeds', async () => {
    const enterError = new Error('enter transition failed');
    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [
        createMatchedRoute('/to', {
          transitionIn: ['fade'],
          mountStrategy: 'per-route',
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
          message: 'enter transition failed',
        }),
        commit: { view: 'staged', href: '/to' },
      }),
    });
  });

  it('cancels before committing when superseded after parallel transitions in full pipeline', async () => {
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
});

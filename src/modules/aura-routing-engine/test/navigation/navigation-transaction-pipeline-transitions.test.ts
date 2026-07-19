jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as branchMount from '../../core/view-mount/branch-mount';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline.runRenderWithTransition (parallel)', () => {
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

  function withPreparedBranch(
    transaction: ReturnType<typeof createMockTransaction>,
    contents: readonly (string | null)[] = ['<page/>'],
  ) {
    transaction.viewSnapshot = contents;
    return transaction;
  }

  it('cancels before transitions when branch contents are missing', async () => {
    const transaction = createMockTransaction({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mockRunPhaseHooks).not.toHaveBeenCalled();
    expect(mountEnterBranchSpy).not.toHaveBeenCalled();
  });

  it('runs commit before parallel transition hooks', async () => {
    const callOrder: string[] = [];

    mountEnterBranchSpy.mockImplementation(() => {
      callOrder.push('render');
      return { status: 'ok' };
    });
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    const transaction = withPreparedBranch(
      createMockTransaction({
        exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
        enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      }),
    );

    await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(callOrder[0]).toBe('render');
    expect(callOrder).toContain('transitionOut');
    expect(callOrder).toContain('transitionIn');
  });

  it('returns navigationSucceeded when render and both transitions succeed', async () => {
    const transaction = withPreparedBranch(
      createMockTransaction({
        exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
        enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      }),
    );

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toBeNull();
  });

  it('returns error from exit transition when it fails', async () => {
    const transitionError = new Error('exit transition failed');
    const transaction = withPreparedBranch(
      createMockTransaction({
        exitRoutes: [
          createMatchedRoute('/from', {
            transitionOut: ['fade'],
            onTransitionOut: () => {
              throw transitionError;
            },
          }),
        ],
        enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
      }),
    );

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
    const transaction = withPreparedBranch(
      createMockTransaction({
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
      }),
    );

    const outcome = await new NavigationTransactionPipeline(transaction).runRenderWithTransition();

    expect(outcome).toEqual({
      status: 'error',
      failure: expect.objectContaining({
        error: expect.objectContaining({
          message: 'exit failed',
        }),
      }),
    });
  });
});

describe('NavigationTransactionPipeline transition + remount order', () => {
  let mountEnterBranchSpy: jest.SpiedFunction<typeof branchMount.mountEnterBranch>;

  beforeEach(() => {
    resetPipelineMocks();
    mountEnterBranchSpy = jest
      .spyOn(branchMount, 'mountEnterBranch')
      .mockImplementation(() => ({ status: 'ok' }));
  });

  afterEach(() => {
    mountEnterBranchSpy.mockRestore();
  });

  it('parallel: transitions run after commit, unmount runs before commitStaged', async () => {
    const callOrder: string[] = [];
    mountEnterBranchSpy.mockImplementation(() => {
      callOrder.push('render');
      return { status: 'ok' };
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
    expect(mockRunViewCommit).not.toHaveBeenCalled();
  });

  it('out-in: transitionOut before commit on same leaf param remount', async () => {
    const callOrder: string[] = [];
    mountEnterBranchSpy.mockImplementation(() => {
      callOrder.push('render');
      return { status: 'ok' };
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
    // loads already done — render path only (contents set by runLoads in full pipeline)
    // For order assertion use loads + render:
    const pipeline = new NavigationTransactionPipeline(transaction);
    await pipeline.runLoads();
    await pipeline.runRenderWithTransition();

    expect(callOrder).toEqual(['transitionOut', 'render', 'transitionIn']);
  });
});

describe('NavigationTransactionPipeline parallel transition edge cases', () => {
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
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });
    transaction.viewSnapshot = ['<page/>'];
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
          onTransitionIn: () => {
            throw enterError;
          },
        }),
      ],
    });
    transaction.viewSnapshot = ['<page/>'];

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

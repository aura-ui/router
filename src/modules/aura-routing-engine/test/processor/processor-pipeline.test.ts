import type { RouteInstance } from '../../core/hooks/types';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { runPhaseHooks } from '../../core/hooks/registry';
import { AuraRoutingProcessorJob } from '../../core/processor/cancellation/job';
import { CommitTracker } from '../../core/view-mount/view-mount-tracker';
import {
  ProcessorPipeline,
  type PipelineContext,
  type PipelineOutcome,
} from '../../core/processor/processor-pipeline';
import { runBlockingPhaseHooks } from '../../core/hooks/pipeline-hooks';
import { toLifecycleContext } from '../../core/lifecycle/context';
import { runViewCommit } from '../../core/view-mount/view-render';
import { createTestRoute } from '../helpers/create-test-route';

jest.mock('../../core/hooks/registry', () => ({
  ...jest.requireActual('../../core/hooks/registry'),
  runPhaseHooks: jest.fn(),
}));

jest.mock('../../core/view-mount/view-render', () => ({
  ...jest.requireActual('../../core/view-mount/view-render'),
  runViewCommit: jest.fn(),
}));

const mockRunPhaseHooks = runPhaseHooks as jest.MockedFunction<typeof runPhaseHooks>;
const mockRunViewCommit = runViewCommit as jest.MockedFunction<typeof runViewCommit>;

function runBlockingHooks(
  lifecycleContext: ReturnType<typeof toLifecycleContext>,
  pipelineContext: PipelineContext,
  hookNames: readonly string[],
) {
  return runBlockingPhaseHooks(lifecycleContext, {
    hookRegistry: pipelineContext.hookRegistry,
    isJobActive: pipelineContext.isJobActive,
  }, hookNames);
}

function createMatchedRoute(path: string, overrides: Partial<RouteInstance> = {}): MatchedRouteInfo {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, overrides) as MatchedRouteInfo['route'],
  };
}

function createPipelineContext(overrides: {
  exitRoutes?: MatchedRouteInfo[];
  enterRoutes?: MatchedRouteInfo[];
  transitionOrder?: 'out-in' | 'in-out' | 'parallel' | null;
} = {}): PipelineContext {
  const enterRoute = overrides.enterRoutes?.[0] ?? createMatchedRoute('/to');
  const job = new AuraRoutingProcessorJob(1);

  return {
    transaction: {
      from: null,
      to: enterRoute,
      action: 'push',
      transitionOrder: overrides.transitionOrder ?? 'parallel',
      plan: {
        exitRoutes: overrides.exitRoutes ?? [],
        enterRoutes: overrides.enterRoutes ?? [enterRoute],
        lca: null,
        reenter: false,
      },
    },
    job,
    router: { navigate: jest.fn() },
    hookRegistry: {} as PipelineContext['hookRegistry'],
    commitTracker: new CommitTracker(enterRoute.href),
    isJobActive: () => true,
  };
}

function lifecycleInput(pipelineContext: PipelineContext) {
  const { transaction, router, job } = pipelineContext;
  return {
    from: transaction.from,
    action: transaction.action,
    router,
    job,
  };
}

describe('runBlockingPhaseHooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns cancelled when hook returns false', async () => {
    mockRunPhaseHooks.mockResolvedValue(false);

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { enter: ['auth'] })],
    });
    const matchedRoute = pipelineContext.transaction.plan.enterRoutes[0]!;
    const lifecycleContext = toLifecycleContext('enter', matchedRoute, lifecycleInput(pipelineContext));

    const outcome = await runBlockingHooks(lifecycleContext, pipelineContext, ['auth']);

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('returns redirect when hook returns a URL string', async () => {
    mockRunPhaseHooks.mockResolvedValue('/login');

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { enter: ['auth'] })],
    });
    const matchedRoute = pipelineContext.transaction.plan.enterRoutes[0]!;
    const lifecycleContext = toLifecycleContext('enter', matchedRoute, lifecycleInput(pipelineContext));

    const outcome = await runBlockingHooks(lifecycleContext, pipelineContext, ['auth']);

    expect(outcome).toEqual({ status: 'redirect', url: '/login' });
  });

  it('returns redirect with replace when hook returns redirect object', async () => {
    mockRunPhaseHooks.mockResolvedValue({ url: '/login', replace: true });

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { enter: ['auth'] })],
    });
    const matchedRoute = pipelineContext.transaction.plan.enterRoutes[0]!;
    const lifecycleContext = toLifecycleContext('enter', matchedRoute, lifecycleInput(pipelineContext));

    const outcome = await runBlockingHooks(lifecycleContext, pipelineContext, ['auth']);

    expect(outcome).toEqual({ status: 'redirect', url: '/login', replace: true });
  });

  it('returns null when hook allows navigation to continue', async () => {
    mockRunPhaseHooks.mockResolvedValue(undefined);

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { enter: ['auth'] })],
    });
    const matchedRoute = pipelineContext.transaction.plan.enterRoutes[0]!;
    const lifecycleContext = toLifecycleContext('enter', matchedRoute, lifecycleInput(pipelineContext));

    const outcome = await runBlockingHooks(lifecycleContext, pipelineContext, ['auth']);

    expect(outcome).toBeNull();
  });
});

describe('ProcessorPipeline.runRenderWithTransition (parallel)', () => {
  const pipeline = new ProcessorPipeline();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('cancels before transitions when view commit is aborted', async () => {
    mockRunViewCommit.mockResolvedValue('aborted');

    const pipelineContext = createPipelineContext({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    const outcome = await pipeline.runRenderWithTransition(pipelineContext);

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

    const pipelineContext = createPipelineContext({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    await pipeline.runRenderWithTransition(pipelineContext);

    expect(callOrder[0]).toBe('render');
    expect(callOrder).toContain('transitionOut');
    expect(callOrder).toContain('transitionIn');
  });

  it('returns null when render and both transitions succeed', async () => {
    const pipelineContext = createPipelineContext({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    const outcome = await pipeline.runRenderWithTransition(pipelineContext);

    expect(outcome).toBeNull();
  });

  it('defers supersede handling to runAfterRender after parallel transitions', async () => {
    let active = true;
    const pipelineContext = createPipelineContext({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });
    pipelineContext.isJobActive = () => active;
    mockRunPhaseHooks.mockImplementation(async () => {
      active = false;
    });

    const transitionOutcome = await pipeline.runRenderWithTransition(pipelineContext);
    expect(transitionOutcome).toBeNull();

    const afterOutcome = await pipeline.runAfterRender(pipelineContext);
    expect(afterOutcome).toEqual({ status: 'cancelled' });
  });

  it('returns error from exit transition when it fails', async () => {
    const transitionError = new Error('exit transition failed');
    const pipelineContext = createPipelineContext({
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

    const outcome = await pipeline.runRenderWithTransition(pipelineContext);

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
    const pipelineContext = createPipelineContext({
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

    const outcome = await pipeline.runRenderWithTransition(pipelineContext);

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

describe('ProcessorPipeline.runRenderWithTransition sequential policies', () => {
  const pipeline = new ProcessorPipeline();

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

    const pipelineContext = createPipelineContext({
      transitionOrder: policy,
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    await pipeline.runRenderWithTransition(pipelineContext);

    expect(callOrder).toEqual(expectedOrder);
  });
});

describe('ProcessorPipeline.runAfterRender', () => {
  const pipeline = new ProcessorPipeline();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('runs left then after', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const pipelineContext = createPipelineContext({
      exitRoutes: [createMatchedRoute('/from', { hooks: { left: ['cleanup'] } })],
      enterRoutes: [createMatchedRoute('/to', { afterHook: ['analytics'] })],
    });

    await pipeline.runAfterRender(pipelineContext);

    expect(phases).toEqual(['left', 'after']);
  });
});

describe('ProcessorPipeline supersede', () => {
  const pipeline = new ProcessorPipeline();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('runAfterRender skips commit when job is superseded', async () => {
    const commitStagedView = jest.fn();
    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { commitStagedView })],
    });
    pipelineContext.isJobActive = () => false;
    pipelineContext.commitTracker.markViewStaged();

    const outcome = await pipeline.runAfterRender(pipelineContext);

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(commitStagedView).not.toHaveBeenCalled();
    expect(pipelineContext.commitTracker.isViewCommitted()).toBe(false);
  });

  it('run returns cancelled instead of viewCommitted when superseded at end', async () => {
    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to')],
    });
    pipelineContext.isJobActive = () => false;

    const result = await pipeline.run(pipelineContext);

    expect(result).toEqual({ status: 'cancelled' });
  });
});

describe('ProcessorPipeline.runReenter', () => {
  const pipeline = new ProcessorPipeline();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('runs reenter only, not after', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { hooks: { reenter: ['sync'] }, afterHook: ['analytics'] })],
    });
    pipelineContext.transaction.plan.reenter = true;

    await pipeline.runReenter(pipelineContext);

    expect(phases).toEqual(['reenter']);
  });
});

describe('ProcessorPipeline phase hooks attr', () => {
  const pipeline = new ProcessorPipeline();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('runs hooks from hooks map on matching phase', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const pipelineContext = createPipelineContext({
      exitRoutes: [createMatchedRoute('/from', { hooks: { left: ['cleanup'] } })],
      enterRoutes: [createMatchedRoute('/to', { hooks: { transitionIn: ['fade-in'] } })],
    });

    await pipeline.runAfterRender(pipelineContext);

    expect(phases).toEqual(['left']);
  });
});

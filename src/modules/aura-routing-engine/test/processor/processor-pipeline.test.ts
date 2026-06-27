import type { RouteInstance } from '../../core/hooks/types';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { AuraRoutingProcessorJob } from '../../core/processor/job';
import {
  ProcessorPipeline,
  toLifecycleContext,
  type PipelineContext,
  type PipelineOutcome,
} from '../../core/processor/processor-pipeline';
import type { HookRunner } from '../../core/hooks/runner';
import { createTestRoute } from '../helpers/create-test-route';

const mockRunPhaseHooks = jest.fn<ReturnType<HookRunner['runPhaseHooks']>, Parameters<HookRunner['runPhaseHooks']>>();
const mockRunViewCommit = jest.fn<ReturnType<HookRunner['runViewCommit']>, Parameters<HookRunner['runViewCommit']>>();

const mockHookRunner = {
  runPhaseHooks: mockRunPhaseHooks,
  runViewCommit: mockRunViewCommit,
} as unknown as HookRunner;

type PipelineInternals = ProcessorPipeline & {
  runBlockingHooks(
    lifecycleContext: ReturnType<typeof toLifecycleContext>,
    pipelineContext: PipelineContext,
    hookNames: readonly string[],
  ): Promise<PipelineOutcome>;
  runParallelRenderWithTransition(pipelineContext: PipelineContext): Promise<PipelineOutcome>;
};

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
    hookRunner: mockHookRunner,
    isJobActive: () => true,
  };
}

describe('ProcessorPipeline.runBlockingHooks', () => {
  const pipeline = new ProcessorPipeline() as PipelineInternals;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns cancelled when hook returns false', async () => {
    mockRunPhaseHooks.mockResolvedValue(false);

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { enter: ['auth'] })],
    });
    const matchedRoute = pipelineContext.transaction.plan.enterRoutes[0]!;
    const lifecycleContext = toLifecycleContext('enter', matchedRoute, pipelineContext);

    const outcome = await pipeline.runBlockingHooks(lifecycleContext, pipelineContext, ['auth']);

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('returns redirect when hook returns a URL string', async () => {
    mockRunPhaseHooks.mockResolvedValue('/login');

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { enter: ['auth'] })],
    });
    const matchedRoute = pipelineContext.transaction.plan.enterRoutes[0]!;
    const lifecycleContext = toLifecycleContext('enter', matchedRoute, pipelineContext);

    const outcome = await pipeline.runBlockingHooks(lifecycleContext, pipelineContext, ['auth']);

    expect(outcome).toEqual({ status: 'redirect', url: '/login' });
  });

  it('returns redirect with replace when hook returns redirect object', async () => {
    mockRunPhaseHooks.mockResolvedValue({ url: '/login', replace: true });

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { enter: ['auth'] })],
    });
    const matchedRoute = pipelineContext.transaction.plan.enterRoutes[0]!;
    const lifecycleContext = toLifecycleContext('enter', matchedRoute, pipelineContext);

    const outcome = await pipeline.runBlockingHooks(lifecycleContext, pipelineContext, ['auth']);

    expect(outcome).toEqual({ status: 'redirect', url: '/login', replace: true });
  });

  it('returns null when hook allows navigation to continue', async () => {
    mockRunPhaseHooks.mockResolvedValue(undefined);

    const pipelineContext = createPipelineContext({
      enterRoutes: [createMatchedRoute('/to', { enter: ['auth'] })],
    });
    const matchedRoute = pipelineContext.transaction.plan.enterRoutes[0]!;
    const lifecycleContext = toLifecycleContext('enter', matchedRoute, pipelineContext);

    const outcome = await pipeline.runBlockingHooks(lifecycleContext, pipelineContext, ['auth']);

    expect(outcome).toBeNull();
  });
});

describe('ProcessorPipeline.runParallelRenderWithTransition', () => {
  const pipeline = new ProcessorPipeline() as PipelineInternals;

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

    const outcome = await pipeline.runParallelRenderWithTransition(pipelineContext);

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mockRunPhaseHooks).not.toHaveBeenCalled();
  });

  it('runs render before parallel transition hooks', async () => {
    const callOrder: string[] = [];

    mockRunViewCommit.mockImplementation(async () => {
      callOrder.push('render');
      return 'ok';
    });
    mockRunPhaseHooks.mockImplementation(async (ctx, _names) => {
      callOrder.push(ctx.phase);
    });

    const pipelineContext = createPipelineContext({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    await pipeline.runParallelRenderWithTransition(pipelineContext);

    expect(callOrder[0]).toBe('render');
    expect(callOrder).toContain('transitionOut');
    expect(callOrder).toContain('transitionIn');
  });

  it('returns null when render and both transitions succeed', async () => {
    const pipelineContext = createPipelineContext({
      exitRoutes: [createMatchedRoute('/from', { transitionOut: ['fade'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade'] })],
    });

    const outcome = await pipeline.runParallelRenderWithTransition(pipelineContext);

    expect(outcome).toBeNull();
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

    const outcome = await pipeline.runParallelRenderWithTransition(pipelineContext);

    expect(outcome).toEqual({
      status: 'error',
      error: transitionError,
      phase: 'transitionOut',
      viewCommitted: false,
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

    const outcome = await pipeline.runParallelRenderWithTransition(pipelineContext);

    expect(outcome).toEqual({
      status: 'error',
      error: exitError,
      phase: 'transitionOut',
      viewCommitted: false,
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
    mockRunPhaseHooks.mockImplementation(async (ctx, _names) => {
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
    mockRunPhaseHooks.mockImplementation(async (ctx, _names) => {
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

describe('ProcessorPipeline.runReenter', () => {
  const pipeline = new ProcessorPipeline();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('runs reenter only, not after', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (ctx, _names) => {
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
    mockRunPhaseHooks.mockImplementation(async (ctx, _names) => {
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

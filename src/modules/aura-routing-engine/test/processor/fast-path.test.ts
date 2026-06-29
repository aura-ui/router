import type { RouteInstance } from '../../core';
import { HookRegistry, runPhaseHooks } from '../../core';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
import { AuraRoutingProcessor } from '../../core/processor/processor';
import { ProcessorPipeline } from '../../core/processor/processor-pipeline';
import { canUseFastPath } from '../../core/processor/fast-path/can-use-fast-path';
import { createTestRoute } from '../helpers/create-test-route';

jest.mock('../../core/hooks/registry', () => ({
  ...jest.requireActual('../../core/hooks/registry'),
  runPhaseHooks: jest.fn(),
}));

const mockRunPhaseHooks = runPhaseHooks as jest.MockedFunction<typeof runPhaseHooks>;

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

describe('canUseFastPath', () => {
  it('allows trivial flat sibling navigation', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b');
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(true);
  });

  it('blocks when enter hooks are declared', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', { enter: ['auth'] });
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks when exit route has leave hooks', () => {
    const from = createMatchedRoute('/a', { leave: ['confirm'] });
    const to = createMatchedRoute('/b');
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks reenter plans', () => {
    const route = createTestRoute('/same');
    const from = createMatchedRoute('/same');
    const to = createMatchedRoute('/same');
    from.route = route as MatchedRouteInfo['route'];
    to.route = route as MatchedRouteInfo['route'];
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });

  it('blocks when enter route has transition order without in/out hooks', () => {
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', {
      transition: { order: 'parallel', in: null, out: null },
    });
    const plan = buildTransitionPlan(from, to);

    expect(canUseFastPath(plan, from, to)).toBe(false);
  });
});

describe('AuraRoutingProcessor fast path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('skips lifecycle pipeline for trivial navigation', async () => {
    const processor = new AuraRoutingProcessor(new HookRegistry());
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b');

    const result = await processor.run({
      from,
      to,
      action: 'push',
      router: { navigate: jest.fn() },
    });

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(mockRunPhaseHooks).not.toHaveBeenCalled();
  });

  it('uses full pipeline when enter guard is declared', async () => {
    const processor = new AuraRoutingProcessor(new HookRegistry());
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', { enter: ['auth'] });

    await processor.run({
      from,
      to,
      action: 'push',
      router: { navigate: jest.fn() },
    });

    expect(mockRunPhaseHooks).toHaveBeenCalled();
  });

  it('uses full pipeline when enter route has transition order without effects', async () => {
    const pipelineRun = jest.spyOn(ProcessorPipeline.prototype, 'run');
    const processor = new AuraRoutingProcessor(new HookRegistry());
    const from = createMatchedRoute('/a');
    const to = createMatchedRoute('/b', {
      transition: { order: 'parallel', in: null, out: null },
    });

    await processor.run({
      from,
      to,
      action: 'push',
      router: { navigate: jest.fn() },
    });

    expect(pipelineRun).toHaveBeenCalledTimes(1);
    expect(mockRunPhaseHooks).not.toHaveBeenCalled();
    pipelineRun.mockRestore();
  });
});

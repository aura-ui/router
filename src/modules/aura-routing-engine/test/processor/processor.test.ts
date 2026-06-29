import type { RouteInstance } from '../../core';
import { HookRegistry, runPhaseHooks } from '../../core';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { AuraRoutingProcessor } from '../../core/processor/processor';
import type { ViewRenderResult } from '../../core/view-mount/view-commit-render';
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

describe('AuraRoutingProcessor.run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('commits staged views and runs the commit gate on success', async () => {
    const commitStagedView = jest.fn();
    const commitGate = jest.fn();
    const processor = new AuraRoutingProcessor(new HookRegistry());
    const to = createMatchedRoute('/to', { commitStagedView });

    const result = await processor.run({
      from: null,
      to,
      action: 'push',
      router: { navigate: jest.fn() },
      commitGate,
    });

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(commitStagedView).toHaveBeenCalledTimes(1);
    expect(commitGate).toHaveBeenCalledTimes(1);
    expect(mockRunPhaseHooks).not.toHaveBeenCalled();
  });

  it('rolls back touched routes when a guard cancels', async () => {
    const revertInFlightView = jest.fn();
    const commitGate = jest.fn();
    const processor = new AuraRoutingProcessor(new HookRegistry());
    const to = createMatchedRoute('/to', {
      enter: ['auth'],
      revertInFlightView,
    });
    mockRunPhaseHooks.mockResolvedValue(false);

    const result = await processor.run({
      from: null,
      to,
      action: 'push',
      router: { navigate: jest.fn() },
      commitGate,
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(revertInFlightView).toHaveBeenCalledTimes(1);
    expect(commitGate).not.toHaveBeenCalled();
  });

  it('rolls back a superseded pending render', async () => {
    const revertInFlightView = jest.fn();
    let resolveRenderStarted!: () => void;
    let resolveFirstRender!: (result: ViewRenderResult) => void;
    const firstRenderStarted = new Promise<void>((resolve) => {
      resolveRenderStarted = resolve;
    });
    const processor = new AuraRoutingProcessor(new HookRegistry());
    const first = createMatchedRoute('/first', {
      revertInFlightView,
      render: async () => {
        resolveRenderStarted();
        return new Promise<ViewRenderResult>((resolve) => {
          resolveFirstRender = resolve;
        });
      },
    });
    const second = createMatchedRoute('/second');

    const firstRun = processor.run({
      from: null,
      to: first,
      action: 'push',
      router: { navigate: jest.fn() },
    });

    await firstRenderStarted;

    const secondRun = processor.run({
      from: null,
      to: second,
      action: 'push',
      router: { navigate: jest.fn() },
    });

    resolveFirstRender({ status: 'ok' });

    await expect(firstRun).resolves.toEqual({ status: 'cancelled' });
    await expect(secondRun).resolves.toEqual({ status: 'navigationSucceeded' });
    expect(revertInFlightView).toHaveBeenCalledTimes(1);
  });

  it('runs reenter without rendering and still passes the commit gate', async () => {
    const commitGate = jest.fn();
    const onReenter = jest.fn();
    const render = jest.fn(async () => ({ status: 'ok' as const }));
    const processor = new AuraRoutingProcessor(new HookRegistry());
    const route = createTestRoute('/same', { onReenter, render });
    const from = createMatchedRoute('/same');
    const to = createMatchedRoute('/same');
    from.route = route as MatchedRouteInfo['route'];
    to.route = route as MatchedRouteInfo['route'];

    const result = await processor.run({
      from,
      to,
      action: 'push',
      router: { navigate: jest.fn() },
      commitGate,
    });

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(onReenter).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(commitGate).toHaveBeenCalledTimes(1);
  });
});

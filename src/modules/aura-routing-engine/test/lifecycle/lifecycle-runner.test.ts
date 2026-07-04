import type { RouteInstance } from '../../core';
import { HookRegistry } from '../../core/hooks/registry';
import {
  HookPolicyExecutor,
  LifecycleRunner,
  PhaseExecutor,
  PHASES,
  type LifecycleRuntimeContext,
} from '../../core/lifecycle';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { createMockNavigationJob } from '../helpers/mock-navigation-job';
import { ViewCommitTracker } from '../../core/view-mount/view-commit-tracker';
import { createTestRoute } from '../helpers/create-test-route';

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

function createLifecycleContext(overrides: {
  exitRoutes?: MatchedRouteInfo[];
  enterRoutes?: MatchedRouteInfo[];
} = {}): LifecycleRuntimeContext {
  const enterRoute = overrides.enterRoutes?.[0] ?? createMatchedRoute('/to');

  return {
    transaction: {
      from: null,
      to: enterRoute,
      action: 'push',
      plan: {
        exitRoutes: overrides.exitRoutes ?? [],
        enterRoutes: overrides.enterRoutes ?? [enterRoute],
        lca: null,
        reenter: false,
      },
    },
    navigationJob: createMockNavigationJob(1),
    router: { navigate: jest.fn() },
    hookRegistry: new HookRegistry(),
    viewCommitTracker: new ViewCommitTracker(enterRoute.href),
    isJobActive: () => true,
  };
}

describe('LifecycleRunner', () => {
  it('runs a phase callback for each route in the configured branch', async () => {
    const onEnter = jest.fn();
    const matchedRoute = createMatchedRoute('/to', { onEnter });
    const context = createLifecycleContext({ enterRoutes: [matchedRoute] });

    const outcome = await new LifecycleRunner().runPhase(PHASES.enter, context);

    expect(outcome).toBeNull();
    expect(onEnter).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'enter',
        to: expect.objectContaining({ pathname: '/to' }),
        route: matchedRoute.route,
      }),
    );
  });

  it('routes thrown phase errors through the error phase handler', async () => {
    const onError = jest.fn();
    const matchedRoute = createMatchedRoute('/to', {
      onEnter: () => {
        throw new Error('enter failed');
      },
      onError,
    });
    const context = createLifecycleContext({ enterRoutes: [matchedRoute] });

    const outcome = await new LifecycleRunner().runPhase(PHASES.enter, context);

    expect(outcome).toMatchObject({
      status: 'error',
      failure: {
        error: expect.objectContaining({
          phase: 'enter',
          routePattern: '/to',
          message: 'enter failed',
        }),
      },
    });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'error',
        error: expect.objectContaining({ message: 'enter failed' }),
      }),
    );
  });

  it('uses one injected HookPolicyExecutor for blocking hooks', async () => {
    const hookPolicyExecutor = new HookPolicyExecutor();
    const runBlocking = jest
      .spyOn(hookPolicyExecutor, 'runBlocking')
      .mockResolvedValue({ status: 'cancelled' });
    const runner = new LifecycleRunner(new PhaseExecutor(hookPolicyExecutor));
    const registry = new HookRegistry();
    registry.register({
      name: 'auth',
      version: '1.0.0',
      fn: async () => false,
    });
    const matchedRoute = createMatchedRoute('/to', { enter: ['auth'] });
    const context = createLifecycleContext({ enterRoutes: [matchedRoute] });
    context.hookRegistry = registry;

    const outcome = await runner.runPhase(PHASES.enter, context);

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(runBlocking).toHaveBeenCalledTimes(1);
    runBlocking.mockRestore();
  });
});

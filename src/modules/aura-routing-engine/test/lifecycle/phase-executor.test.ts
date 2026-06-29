import { FailedNavigation, NavigationError } from '../../core/failure';
import { HookRegistry } from '../../core/hooks/registry';
import {
  HookPolicyExecutor,
  PhaseExecutor,
  PHASES,
  type LifecycleLogger,
} from '../../core/lifecycle';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteInstance } from '../../core/route/types';
import { createTestRoute } from '../helpers/create-test-route';

function createLogger(): jest.Mocked<LifecycleLogger> {
  return {
    phaseFailedAfterCommit: jest.fn(),
    postCommitHookFailed: jest.fn(),
    postCommitCancelIgnored: jest.fn(),
    postCommitRedirectIgnored: jest.fn(),
  };
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

function navigationErrorResult(message: string, matchedRoute: MatchedRouteInfo) {
  return FailedNavigation.fromPipeline(
    new NavigationError({
      code: 'GUARD_THROW',
      phase: 'enter',
      routePattern: matchedRoute.pattern,
      message,
    }),
    { view: 'none', href: matchedRoute.href },
    null,
    matchedRoute,
    'push',
  ).toResult();
}

describe('PhaseExecutor', () => {
  it('invokes the route lifecycle callback and returns null on success', async () => {
    const onEnter = jest.fn();
    const matchedRoute = createMatchedRoute('/to', { onEnter });
    const hookPolicies = new HookPolicyExecutor(createLogger());

    const outcome = await new PhaseExecutor(hookPolicies).execute({
      phase: PHASES.enter,
      route: matchedRoute.route,
      lifecycleContext: {
        phase: 'enter',
        from: null,
        to: { pathname: '/to' },
        router: { navigate: jest.fn() },
        route: matchedRoute.route,
        action: 'push',
        jobId: 1,
        signal: new AbortController().signal,
      },
      hookNames: null,
      hookRegistry: new HookRegistry(),
      isJobActive: () => true,
      failWithError: jest.fn(),
    });

    expect(outcome).toBeNull();
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('routes blocking hook cancel through runPhaseStep handlers', async () => {
    const registry = new HookRegistry();
    registry.register({
      name: 'block',
      version: '1.0.0',
      fn: async () => false,
    });
    const matchedRoute = createMatchedRoute('/to');
    const hookPolicies = new HookPolicyExecutor(createLogger());

    const outcome = await new PhaseExecutor(hookPolicies).execute({
      phase: PHASES.enter,
      route: matchedRoute.route,
      lifecycleContext: {
        phase: 'enter',
        from: null,
        to: { pathname: '/to' },
        router: { navigate: jest.fn() },
        route: matchedRoute.route,
        action: 'push',
        jobId: 1,
        signal: new AbortController().signal,
      },
      hookNames: ['block'],
      hookRegistry: registry,
      isJobActive: () => true,
      failWithError: jest.fn(),
    });

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('delegates route throws with failure policy to failWithError', async () => {
    const matchedRoute = createMatchedRoute('/to', {
      onEnter: () => {
        throw new Error('enter failed');
      },
    });
    const failWithError = jest.fn(async () => navigationErrorResult('enter failed', matchedRoute));
    const hookPolicies = new HookPolicyExecutor(createLogger());

    const outcome = await new PhaseExecutor(hookPolicies).execute({
      phase: PHASES.enter,
      route: matchedRoute.route,
      lifecycleContext: {
        phase: 'enter',
        from: null,
        to: { pathname: '/to' },
        router: { navigate: jest.fn() },
        route: matchedRoute.route,
        action: 'push',
        jobId: 1,
        signal: new AbortController().signal,
      },
      hookNames: null,
      hookRegistry: new HookRegistry(),
      isJobActive: () => true,
      failWithError,
    });

    expect(failWithError).toHaveBeenCalledWith(expect.any(Error));
    expect(outcome).toMatchObject({ status: 'error' });
  });
});

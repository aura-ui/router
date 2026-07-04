import { HookRegistry } from '../../core/hooks/registry';
import { ErrorPhaseHandler, type LifecycleRuntimeContext } from '../../core/lifecycle';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { createMockNavigationJob } from '../helpers/mock-navigation-job';
import type { RouteInstance } from '../../core/route/types';
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

function createTransactionContext(
  matchedRoute: MatchedRouteInfo,
  overrides: Partial<LifecycleRuntimeContext> = {},
): LifecycleRuntimeContext {
  const job = createMockNavigationJob(1);
  return {
    transaction: {
      from: null,
      to: matchedRoute,
      action: 'push',
      plan: {
        exitRoutes: [],
        enterRoutes: [matchedRoute],
        lca: null,
        reenter: false,
      },
    },
    transactionId: job.id,
    transactionSignal: job.signal,
    router: { navigate: jest.fn() },
    hookRegistry: new HookRegistry(),
    viewCommitTracker: new ViewCommitTracker(matchedRoute.href),
    isJobActive: () => true,
    ...overrides,
  };
}

describe('ErrorPhaseHandler', () => {
  it('reports route onError failures without replacing the parent failure', async () => {
    const parentError = new Error('enter failed');
    const routeError = new Error('route onError failed');
    const reportHookError = jest.fn();
    const matchedRoute = createMatchedRoute('/to', {
      onError: () => {
        throw routeError;
      },
    });
    const context = createTransactionContext(matchedRoute, { reportHookError });

    const outcome = await new ErrorPhaseHandler().failNavigation(
      matchedRoute,
      parentError,
      'enter',
      context,
    );

    expect(outcome.failure.error).toMatchObject({
      phase: 'enter',
      routePattern: '/to',
      message: 'enter failed',
    });
    expect(reportHookError).toHaveBeenCalledWith(routeError, outcome.failure);
  });

  it('reports error hook failures through the post-commit hook policy', async () => {
    const hookError = new Error('error hook failed');
    const reportHookError = jest.fn();
    const hookRegistry = new HookRegistry();
    hookRegistry.register({
      name: 'bad-error-hook',
      version: '1.0.0',
      fn: async () => {
        throw hookError;
      },
    });
    const matchedRoute = createMatchedRoute('/to', {
      error: ['bad-error-hook'],
    });
    const context = createTransactionContext(matchedRoute, {
      hookRegistry,
      reportHookError,
    });

    const outcome = await new ErrorPhaseHandler().failNavigation(
      matchedRoute,
      new Error('render failed'),
      'render',
      context,
    );

    expect(outcome.status).toBe('error');
    expect(reportHookError).toHaveBeenCalledWith(hookError, outcome.failure);
  });
});

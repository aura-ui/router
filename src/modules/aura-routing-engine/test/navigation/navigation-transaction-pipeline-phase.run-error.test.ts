import { HookRegistry } from '../../core/hooks/registry';
import { FailedNavigation, NavigationError } from '../../core/failure';
import type { LifecycleRuntimeContext } from '../../core/lifecycle';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationTransactionPipelinePhase } from '../../core/navigation/navigation-transaction-pipeline-phase';
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

function createRuntimeContext(
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
        update: false,
      },
    },
    transactionId: job.transactionId,
    transactionSignal: job.transactionSignal,
    router: { navigate: jest.fn() },
    hookRegistry: new HookRegistry(),
    viewCommitTracker: new ViewCommitTracker(matchedRoute.href),
    isJobActive: () => true,
    ...overrides,
  };
}

function createFailedNavigation(
  matchedRoute: MatchedRouteInfo,
  context: LifecycleRuntimeContext,
  phase: 'guard' | 'load' | 'render' = 'guard',
): FailedNavigation {
  const error = new NavigationError({
    code: phase === 'load' ? 'LOAD_FAILED' : phase === 'render' ? 'RENDER_FAILED' : 'GUARD_THROW',
    phase,
    routePattern: matchedRoute.pattern,
    message: `${phase} failed`,
  });
  return FailedNavigation.fromPipeline(
    error,
    context.viewCommitTracker.snapshot,
    context.transaction.from,
    context.transaction.to,
    context.transaction.action,
  );
}

describe('NavigationTransactionPipelinePhase.runError', () => {
  it('runs onError with normalized error in phase context', async () => {
    const onError = jest.fn();
    const matchedRoute = createMatchedRoute('/to', { onError });
    const context = createRuntimeContext(matchedRoute);
    const failed = createFailedNavigation(matchedRoute, context);

    await NavigationTransactionPipelinePhase.runError(
      matchedRoute,
      failed.error,
      failed,
      context,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'error',
        error: failed.error,
        to: { pathname: '/to' },
      }),
    );
  });

  it('reports attr error hook failures via reportHookError', async () => {
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
    const matchedRoute = createMatchedRoute('/to', { error: ['bad-error-hook'] });
    const context = createRuntimeContext(matchedRoute, { hookRegistry, reportHookError });
    const failed = createFailedNavigation(matchedRoute, context, 'render');

    await NavigationTransactionPipelinePhase.runError(
      matchedRoute,
      failed.error,
      failed,
      context,
    );

    expect(reportHookError).toHaveBeenCalledWith(hookError, failed);
  });

  it('reports route onError failures via reportHookError', async () => {
    const routeError = new Error('route onError failed');
    const reportHookError = jest.fn();
    const matchedRoute = createMatchedRoute('/to', {
      onError: () => {
        throw routeError;
      },
    });
    const context = createRuntimeContext(matchedRoute, { reportHookError });
    const failed = createFailedNavigation(matchedRoute, context, 'render');

    await NavigationTransactionPipelinePhase.runError(
      matchedRoute,
      failed.error,
      failed,
      context,
    );

    expect(reportHookError).toHaveBeenCalledWith(routeError, failed);
  });

  it('ignores redirect results from post-commit error hooks', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hookRegistry = new HookRegistry();
    hookRegistry.register({
      name: 'redirect-error-hook',
      version: '1.0.0',
      fn: async () => '/login',
    });
    const matchedRoute = createMatchedRoute('/to', { error: ['redirect-error-hook'] });
    const context = createRuntimeContext(matchedRoute, { hookRegistry });
    const failed = createFailedNavigation(matchedRoute, context);

    await NavigationTransactionPipelinePhase.runError(
      matchedRoute,
      failed.error,
      failed,
      context,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[error] post-commit hook returned redirect — ignored: /login',
    );
    warnSpy.mockRestore();
  });
});

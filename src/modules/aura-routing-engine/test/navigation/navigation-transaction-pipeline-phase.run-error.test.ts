import { HookRegistry } from '../../core/hooks/registry';
import { NavigationTransactionPipelinePhase } from '../../core/navigation/navigation-transaction-pipeline-phase';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';
import {
  createNavigationFailure,
  createNavigationLifecycleContext,
  registerTestHook,
} from '../_helpers/jest/navigation-fixtures';

describe('NavigationTransactionPipelinePhase.runError', () => {
  it('runs onError with normalized error in phase context', async () => {
    const onError = jest.fn();
    const matchedRoute = createMatchedRoute('/to', { onError });
    const context = createNavigationLifecycleContext(matchedRoute);
    const normalized = createNavigationFailure(matchedRoute, context).error;

    await NavigationTransactionPipelinePhase.runError(
      matchedRoute,
      normalized,
      createNavigationFailure(matchedRoute, context),
      context,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'error',
        error: normalized,
      }),
    );
  });

  it('reports attr error hook failures via reportHookError', async () => {
    const hookError = new Error('error hook failed');
    const reportHookError = jest.fn();
    const hookRegistry = new HookRegistry();
    registerTestHook(hookRegistry, 'bad-error-hook', () => {
      throw hookError;
    });

    const matchedRoute = createMatchedRoute('/to', { error: ['bad-error-hook'] });
    const context = createNavigationLifecycleContext(matchedRoute, { hookRegistry, reportHookError });
    const failed = createNavigationFailure(matchedRoute, context);

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
    const context = createNavigationLifecycleContext(matchedRoute, { reportHookError });
    const failed = createNavigationFailure(matchedRoute, context);

    await NavigationTransactionPipelinePhase.runError(
      matchedRoute,
      failed.error,
      failed,
      context,
    );

    expect(reportHookError).toHaveBeenCalledWith(routeError, failed);
  });

  it('ignores redirect results from post-commit error hooks', async () => {
    const hookRegistry = new HookRegistry();
    registerTestHook(hookRegistry, 'redirect-error-hook', () => '/login');

    const matchedRoute = createMatchedRoute('/to', { error: ['redirect-error-hook'] });
    const context = createNavigationLifecycleContext(matchedRoute, { hookRegistry });
    const failed = createNavigationFailure(matchedRoute, context);

    await expect(
      NavigationTransactionPipelinePhase.runError(
        matchedRoute,
        failed.error,
        failed,
        context,
      ),
    ).resolves.toBeUndefined();
  });
});

import { HookRegistry } from '../../core/hooks/registry';
import { handlePipelineFailure } from '../../core/navigation/pipeline-failure';
import { createMatchedRoute } from '../helpers/create-mock-transaction';
import { createNavigationLifecycleContext } from '../helpers/jest/navigation-fixtures';

describe('handlePipelineFailure', () => {
  it('reports route onError failures without replacing the parent failure', async () => {
    const parentError = new Error('enter failed');
    const routeError = new Error('route onError failed');
    const reportHookError = jest.fn();
    const matchedRoute = createMatchedRoute('/to', {
      onError: () => {
        throw routeError;
      },
    });
    const context = createNavigationLifecycleContext(matchedRoute, { reportHookError });

    const outcome = await handlePipelineFailure(
      matchedRoute,
      parentError,
      'guard',
      context,
    );

    expect(outcome.failure.error).toMatchObject({
      phase: 'guard',
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

    const matchedRoute = createMatchedRoute('/to', { error: ['bad-error-hook'] });
    const context = createNavigationLifecycleContext(matchedRoute, {
      hookRegistry,
      reportHookError,
    });

    const outcome = await handlePipelineFailure(
      matchedRoute,
      new Error('enter failed'),
      'guard',
      context,
    );

    expect(reportHookError).toHaveBeenCalledWith(hookError, outcome.failure);
  });
});

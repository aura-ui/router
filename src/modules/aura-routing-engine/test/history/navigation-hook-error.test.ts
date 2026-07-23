import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import { defineRouteHook } from '../../core/hooks/define-hook';
import { defaultHookRegistry } from '../../core/hooks/registry';
import { collectNavigationErrors } from '../helpers/collect-navigation-errors';
import { createTestRoute } from '../helpers/create-test-route';

describe('onNavigationHookError', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  afterEach(() => {
    defaultHookRegistry.unregister('bad-error-hook');
  });

  it('fires when an error hook throws during failWithError', async () => {
    const hookError = new Error('error hook failed');
    const renderError = new Error('render failed');
    const onNavigationHookError = jest.fn();

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, {
      provider,
      onNavigationHookError,
    });
    const errors = collectNavigationErrors(engine);

    engine.hooksRegistry.register(
      defineRouteHook({
        name: 'bad-error-hook',
        version: '1.0.0',
        fn: async () => {
          throw hookError;
        },
      }),
    );

    engine.registerRoutes([
      createTestRoute('/broken', {
        render: async () => ({ status: 'error', error: renderError }),
        error: ['bad-error-hook'],
      }),
    ]);
    provider.start();
    engine.start();

    await engine.navigateTo('/broken', 'push', { replace: false, syncHistory: true });

    expect(errors).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RENDER_FAILED', phase: 'render' }),
        href: '/broken',
        viewCommitted: true,
      }),
    ]);
    expect(onNavigationHookError).toHaveBeenCalledWith({
      error: hookError,
      phase: 'error',
      parent: expect.objectContaining({
        error: expect.objectContaining({ code: 'RENDER_FAILED', phase: 'render' }),
        href: '/broken',
      }),
    });
  });
});

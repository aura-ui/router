import {
  AuraRoutingEngine,
  AuraRoutingProcessor,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import { defineRouteHook } from '../../core/hooks/define-hook';
import { HookRegistry } from '../../core/hooks/registry';
import { createTestRoute } from '../helpers/create-test-route';

describe('onNavigationHookError', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  it('fires when an error hook throws during failWithError', async () => {
    const hookError = new Error('error hook failed');
    const registry = new HookRegistry();
    registry.register(
      defineRouteHook({
        name: 'bad-error-hook',
        version: '1.0.0',
        fn: async () => {
          throw hookError;
        },
      }),
    );

    const renderError = new Error('render failed');
    const onNavigationHookError = jest.fn();
    const onNavigationError = jest.fn();

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(registry), router, {
      provider,
      onNavigationError,
      onNavigationHookError,
    });

    engine.registerRoutes([
      createTestRoute('/broken', {
        render: async () => ({ status: 'error', error: renderError }),
        error: ['bad-error-hook'],
      }),
    ]);
    provider.start();

    await engine.navigateTo('/broken', 'push', { replace: false, syncHistory: true });

    expect(onNavigationError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RENDER_FAILED', phase: 'render' }),
        href: '/broken',
        viewCommitted: true,
      }),
    );
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

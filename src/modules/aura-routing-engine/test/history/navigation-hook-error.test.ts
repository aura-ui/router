import { defineRouteHook } from '../../core/hooks/define-hook';
import { defaultHookRegistry } from '../../core/hooks/registry';
import { collectNavigationErrors } from '../_helpers/collect-navigation-errors';
import { createTestRoute } from '../_helpers/create-test-route';
import { createEngineHarness } from '../_helpers/engine-harness';

describe('onNavigationHookError', () => {
  afterEach(() => {
    defaultHookRegistry.unregister('bad-error-hook');
  });

  it('fires when an error hook throws during failWithError', async () => {
    const hookError = new Error('error hook failed');
    const renderError = new Error('render failed');
    const onNavigationHookError = jest.fn();

    const { engine } = createEngineHarness({
      routes: [
        createTestRoute('/broken', {
          resolveAndMountView: async () => ({ status: 'error', error: renderError }),
          error: ['bad-error-hook'],
        }),
      ],
      onNavigationHookError,
      startProvider: false,
    });
    const errors = collectNavigationErrors(engine);

    engine.hooksRegistry.register(
      defineRouteHook('bad-error-hook', async () => {
        throw hookError;
      }),
    );

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

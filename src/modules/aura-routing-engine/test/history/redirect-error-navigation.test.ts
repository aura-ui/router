import { MAX_REDIRECTION_STEPS } from '../../core/redirect/redirect-resolver';
import { collectNavigationErrors } from '../_helpers/collect-navigation-errors';
import { createTestRoute } from '../_helpers/create-test-route';
import { bootEngine, createEngineHarness } from '../_helpers/engine-harness';
import {
  collectRoutesFromDom,
  createDomRedirectRoute,
} from '../_helpers/test-route-dom';

describe('AuraRoutingEngine redirect-error', () => {
  it('emits navigation:error on redirect cycle and preserves history', async () => {
    const onNotFound = jest.fn();

    const { engine, provider } = createEngineHarness({
      href: '/home',
      routes: [
        createTestRoute('/home'),
        ...collectRoutesFromDom(
          createDomRedirectRoute('/a', '/b'),
          createDomRedirectRoute('/b', '/a'),
        ),
      ],
      onNotFound,
    });
    const errors = collectNavigationErrors(engine);

    await bootEngine(engine, '/home');
    await engine.navigateTo('/a', 'push', { replace: false, syncHistory: true });

    expect(errors).toEqual([
      expect.objectContaining({
        href: '/a',
        error: expect.objectContaining({
          code: 'REDIRECT_CYCLE',
          phase: 'match',
          message: 'Redirect cycle detected at /a',
        }),
      }),
    ]);
    expect(onNotFound).not.toHaveBeenCalled();
    expect(provider.currentHref).toBe('/home');
  });

  it('emits navigation:error on redirect depth exceeded', async () => {
    const routes = Array.from({ length: MAX_REDIRECTION_STEPS + 1 }, (_, index) => {
      const path = `/hop-${index}`;
      const next = `/hop-${index + 1}`;
      return createDomRedirectRoute(path, next);
    });

    const { engine, provider } = createEngineHarness({
      domRoutes: routes,
    });
    const errors = collectNavigationErrors(engine);

    await engine.navigateTo('/hop-0', 'push', { replace: false, syncHistory: true });

    expect(errors).toEqual([
      expect.objectContaining({
        href: `/hop-${MAX_REDIRECTION_STEPS}`,
        error: expect.objectContaining({
          code: 'REDIRECT_DEPTH_EXCEEDED',
          phase: 'match',
        }),
      }),
    ]);
    expect(provider.currentHref).toBe('/');
  });
});

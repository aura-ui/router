import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import { MAX_REDIRECTION_STEPS } from '../../core/redirect/redirect-resolver';
import { collectNavigationErrors } from '../_helpers/collect-navigation-errors';
import { createTestRoute } from '../_helpers/create-test-route';
import {
  collectRoutesFromDom,
  createDomRedirectRoute,
} from '../_helpers/test-route-dom';

describe('AuraRoutingEngine redirect-error', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  it('emits navigation:error on redirect cycle and preserves history', async () => {
    const onNotFound = jest.fn();

    const provider = new FakeHistoryProvider('/home');
    const engine = new AuraRoutingEngine(router, {
      provider,
      onNotFound,
    });
    const errors = collectNavigationErrors(engine);
    engine.registerRoutes([
      createTestRoute('/home'),
      ...collectRoutesFromDom(
        createDomRedirectRoute('/a', '/b'),
        createDomRedirectRoute('/b', '/a'),
      ),
    ]);
    provider.start();

    await engine.navigateTo('/home', 'system', { replace: true, syncHistory: false });
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

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });
    const errors = collectNavigationErrors(engine);
    engine.replaceRoutes(collectRoutesFromDom(...routes));
    provider.start();

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

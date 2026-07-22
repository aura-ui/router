import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import * as redirectResolver from '../../core/redirect/redirect-resolver';
import { collectNavigationErrors } from '../helpers/collect-navigation-errors';
import { createTestRoute } from '../helpers/create-test-route';

describe('AuraRoutingEngine NOT_FOUND', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  it('runs onUnmount, reports onNotFound, and commits URL on push', async () => {
    const onUnmount = jest.fn();
    const onNotFound = jest.fn();

    const provider = new FakeHistoryProvider('/home');
    const engine = new AuraRoutingEngine(router, {
      provider,
      onNotFound,
    });
    engine.registerRoutes([createTestRoute('/home', { onUnmount })]);
    provider.start();
    const errors = collectNavigationErrors(engine);

    await engine.navigateTo('/home', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/missing', 'push', { replace: false, syncHistory: true });

    expect(onUnmount).toHaveBeenCalledTimes(1);
    expect(onNotFound).toHaveBeenCalledWith(
      expect.objectContaining({
        href: '/missing',
        error: expect.objectContaining({ code: 'NOT_FOUND', phase: 'match' }),
      }),
    );
    expect(provider.currentHref).toBe('/missing');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error.code).toBe('NOT_FOUND');
  });

  it('reports NOT_FOUND for redirect target href, not the original request', async () => {
    const onNotFound = jest.fn();
    const followSpy = jest.spyOn(redirectResolver, 'followRedirectsWithGuardWalk').mockResolvedValue({
      status: 'unmatched',
      href: '/missing',
    });

    const provider = new FakeHistoryProvider('/home');
    const engine = new AuraRoutingEngine(router, {
      provider,
      onNotFound,
    });
    engine.registerRoutes([createTestRoute('/home')]);
    provider.start();

    await engine.navigateTo('/home', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/entry', 'push', { replace: false, syncHistory: true });

    followSpy.mockRestore();

    expect(onNotFound).toHaveBeenCalledWith(
      expect.objectContaining({
        href: '/missing',
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: 'No route matched /missing',
        }),
      }),
    );
    expect(provider.currentHref).toBe('/missing');
  });
});

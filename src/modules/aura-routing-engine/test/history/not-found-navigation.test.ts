import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import * as redirectResolver from '../../core/redirect/redirect-resolver';
import { createTestRoute } from '../helpers/create-test-route';

describe('AuraRoutingEngine NOT_FOUND', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  it('runs onUnmount, reports onNotFound, recovery, and commits URL on push', async () => {
    const onUnmount = jest.fn();
    const onNotFound = jest.fn();
    const recover = jest.fn();

    const provider = new FakeHistoryProvider('/home');
    const engine = new AuraRoutingEngine(router, {
      provider,
      onNotFound,
    });
    engine.setNotFoundHandler(recover);
    engine.registerRoutes([createTestRoute('/home', { onUnmount })]);
    provider.start();

    await engine.navigateTo('/home', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/missing', 'push', { replace: false, syncHistory: true });

    expect(onUnmount).toHaveBeenCalledTimes(1);
    expect(onNotFound).toHaveBeenCalledWith(
      expect.objectContaining({
        href: '/missing',
        error: expect.objectContaining({ code: 'NOT_FOUND', phase: 'match' }),
      }),
    );
    expect(recover).toHaveBeenCalledWith('/missing');
    expect(provider.currentHref).toBe('/missing');
  });

  it('reports NOT_FOUND for redirect target href, not the original request', async () => {
    const onNotFound = jest.fn();
    const recover = jest.fn();
    const followSpy = jest.spyOn(redirectResolver, 'followRedirectsWithGuardWalk').mockResolvedValue({
      status: 'unmatched',
      href: '/missing',
    });

    const provider = new FakeHistoryProvider('/home');
    const engine = new AuraRoutingEngine(router, {
      provider,
      onNotFound,
    });
    engine.setNotFoundHandler(recover);
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
    expect(recover).toHaveBeenCalledWith('/missing');
    expect(provider.currentHref).toBe('/missing');
  });

  it('skips recovery when onNotFound returns false', async () => {
    const recover = jest.fn();
    const onNotFound = jest.fn().mockReturnValue(false);

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, {
      provider,
      onNotFound,
    });
    engine.setNotFoundHandler(recover);
    engine.registerRoutes([createTestRoute('/')]);
    provider.start();

    await engine.navigateTo('/nope', 'push', { replace: false, syncHistory: true });

    expect(recover).not.toHaveBeenCalled();
    expect(provider.currentHref).toBe('/nope');
  });
});

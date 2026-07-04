import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import { createTestRoute } from '../helpers/create-test-route';

describe('AuraRoutingEngine NOT_FOUND', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  it('runs onLeft, reports onNotFound, recovery, and commits URL on push', async () => {
    const onLeft = jest.fn();
    const onNotFound = jest.fn();
    const recover = jest.fn();

    const provider = new FakeHistoryProvider('/home');
    const engine = new AuraRoutingEngine(router, {
      provider,
      onNotFound,
    });
    engine.setNotFoundHandler(recover);
    engine.registerRoutes([createTestRoute('/home', { onLeft })]);
    provider.start();

    await engine.navigateTo('/home', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/missing', 'push', { replace: false, syncHistory: true });

    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onNotFound).toHaveBeenCalledWith(
      expect.objectContaining({
        href: '/missing',
        error: expect.objectContaining({ code: 'NOT_FOUND', phase: 'match' }),
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

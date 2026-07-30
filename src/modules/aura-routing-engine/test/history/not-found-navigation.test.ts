import * as redirectResolver from '../../core/redirect/redirect-resolver';
import { collectNavigationErrors } from '../_helpers/collect-navigation-errors';
import { createTestRoute } from '../_helpers/create-test-route';
import { bootEngine, createEngineHarness } from '../_helpers/engine-harness';

describe('AuraRoutingEngine NOT_FOUND', () => {
  it('runs onUnmount, reports onNotFound, and commits URL on push', async () => {
    const onUnmount = jest.fn();
    const onNotFound = jest.fn();

    const { engine, provider } = createEngineHarness({
      href: '/home',
      routes: [createTestRoute('/home', { onUnmount })],
      onNotFound,
    });
    const errors = collectNavigationErrors(engine);

    await bootEngine(engine, '/home');
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

    const { engine, provider } = createEngineHarness({
      href: '/home',
      routes: [createTestRoute('/home')],
      onNotFound,
    });

    await bootEngine(engine, '/home');
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

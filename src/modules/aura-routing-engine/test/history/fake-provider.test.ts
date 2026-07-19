import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import { defineRouteHook } from '../../core/hooks/define-hook';
import { defaultHookRegistry } from '../../core/hooks/registry';
import { collectNavigationErrors } from '../helpers/collect-navigation-errors';
import { createTestRoute } from '../helpers/create-test-route';
import { collectRoutesFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('FakeHistoryProvider', () => {
  it('push + commit обновляет стек URL', () => {
    const provider = new FakeHistoryProvider('/home');

    provider.commit('/about', { replace: false, syncHistory: true });

    expect(provider.currentHref).toBe('/about');
    expect(provider.entries).toEqual(['/home', '/about']);
  });

  it('replace + commit перезаписывает текущую запись', () => {
    const provider = new FakeHistoryProvider('/home');
    provider.commit('/draft', { replace: false, syncHistory: true });

    provider.commit('/final', { replace: true, syncHistory: true });

    expect(provider.currentHref).toBe('/final');
    expect(provider.entries).toEqual(['/home', '/final']);
  });

  it('goBack эмитит pop с уже изменённым URL', () => {
    const provider = new FakeHistoryProvider('/');
    const handler = jest.fn();

    provider.onNavigation(handler);
    provider.start();
    provider.commit('/a', { replace: false, syncHistory: true });
    provider.commit('/b', { replace: false, syncHistory: true });

    provider.goBack();

    expect(provider.currentHref).toBe('/a');
    expect(handler).toHaveBeenLastCalledWith({
      href: '/a',
      action: 'pop',
      replace: true,
      syncHistory: false,
    });
  });

  it('rollback восстанавливает URL при отменённом pop', () => {
    const provider = new FakeHistoryProvider('/');
    provider.commit('/a', { replace: false, syncHistory: true });
    provider.commit('/b', { replace: false, syncHistory: true });

    provider.goBack();
    provider.rollback('/b');

    expect(provider.currentHref).toBe('/b');
  });
});

describe('AuraRoutingEngine + FakeHistoryProvider', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  it('после успешного push обновляет URL в provider', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });

    engine.registerRoutes([createTestRoute('/'), createTestRoute('/about')]);
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(provider.currentHref).toBe('/about');
    expect(provider.entries).toEqual(['/', '/about']);
  });

  it('calls onAnchorNavigation for hash-only navigateTo', async () => {
    const onAnchorNavigation = jest.fn();
    const provider = new FakeHistoryProvider('/docs');
    const engine = new AuraRoutingEngine(router, { provider, onAnchorNavigation });

    engine.registerRoutes([createTestRoute('/docs')]);
    provider.start();

    await engine.navigateTo('/docs', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/docs#intro', 'push', { replace: false, syncHistory: true });

    expect(onAnchorNavigation).toHaveBeenCalledTimes(1);
    expect(onAnchorNavigation).toHaveBeenCalledWith('/docs#intro');
    expect(provider.currentHref).toBe('/docs#intro');
  });

  it('canonicalizes index folder URL without trailing slash on start', async () => {
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const provider = new FakeHistoryProvider('/app/settings');
    const engine = new AuraRoutingEngine(router, { provider });

    engine.registerRoutes(collectRoutesFromDom(settings));
    engine.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(provider.currentHref).toBe('/app/settings/');
  });

  it('clickLink проходит через engine и commit-ит URL', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });

    engine.registerRoutes([createTestRoute('/'), createTestRoute('/about')]);
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    provider.clickLink('/about');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(provider.currentHref).toBe('/about');
  });

  it('при ошибке render вызывает onUnmount у from и коммитит URL', async () => {
    const fromLeft = jest.fn();
    const renderError = new Error('load failed');
    const fromRoute = createTestRoute('/a', { onUnmount: fromLeft });
    const toRoute = createTestRoute('/d', {
      render: jest.fn().mockResolvedValue({ status: 'error', error: renderError }),
    });
    const provider = new FakeHistoryProvider('/a');
    const engine = new AuraRoutingEngine(router, { provider });
    const errors = collectNavigationErrors(engine);

    engine.registerRoutes([fromRoute, toRoute]);
    provider.start();
    engine.start();

    await engine.navigateTo('/a', 'system', { replace: true, syncHistory: false });
    await new Promise(resolve => setTimeout(resolve, 1));
    await engine.navigateTo('/d', 'push', { replace: false, syncHistory: true });

    expect(fromLeft).toHaveBeenCalledTimes(1);
    expect(provider.currentHref).toBe('/d');
    expect(errors).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RENDER_FAILED', phase: 'render' }),
        href: '/d',
        viewCommitted: true,
      }),
    ]);
  });

  it('при ошибке до render emit navigation:error без commit URL', async () => {
    const fromLeft = jest.fn();
    const enterError = new Error('guard failed');
    const fromRoute = createTestRoute('/a', { onUnmount: fromLeft });
    const toRoute = createTestRoute('/d', { guard: ['guard'] });

    const provider = new FakeHistoryProvider('/a');
    const engine = new AuraRoutingEngine(router, { provider });
    const errors = collectNavigationErrors(engine);

    engine.hooksRegistry.register(
      defineRouteHook({
        name: 'guard',
        version: '1.0.0',
        fn: async () => {
          throw enterError;
        },
      }),
    );

    engine.registerRoutes([fromRoute, toRoute]);
    provider.start();
    engine.start();

    try {
      await engine.navigateTo('/a', 'system', { replace: true, syncHistory: false });
      await engine.navigateTo('/d', 'push', { replace: false, syncHistory: true });

      expect(fromLeft).not.toHaveBeenCalled();
      expect(provider.currentHref).toBe('/a');
      expect(errors).toEqual([
        expect.objectContaining({
          error: expect.objectContaining({ code: 'GUARD_THROW', phase: 'guard' }),
          href: '/d',
          viewCommitted: false,
        }),
      ]);
    } finally {
      defaultHookRegistry.unregister('guard');
    }
  });
});

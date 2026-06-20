import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { AuraRoutingProcessor } from '../../core/aura-routing-processor';
import { FakeHistoryProvider } from '../../core/providers/fake-history-provider';
import type { RouterInstance } from '../../../aura-route-hooks/core';

import { createTestRoute } from './create-test-route';

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
    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, { provider });

    engine.registerRoutes([createTestRoute('/'), createTestRoute('/about')]);
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(provider.currentHref).toBe('/about');
    expect(provider.entries).toEqual(['/', '/about']);
  });

  it('clickLink проходит через engine и commit-ит URL', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, { provider });

    engine.registerRoutes([createTestRoute('/'), createTestRoute('/about')]);
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    provider.clickLink('/about');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(provider.currentHref).toBe('/about');
  });
});

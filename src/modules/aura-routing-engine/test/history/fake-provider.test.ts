import { FakeHistoryProvider } from '../../core';
import { defineRouteHook } from '../../core/hooks/define-hook';
import { defaultHookRegistry } from '../../core/hooks/registry';
import { collectNavigationErrors } from '../_helpers/collect-navigation-errors';
import { createTestRoute } from '../_helpers/create-test-route';
import { bootEngine, createEngineHarness } from '../_helpers/engine-harness';
import { collectRoutesFromDom, createDomRoute } from '../_helpers/test-route-dom';

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
  it('после успешного push обновляет URL в provider', async () => {
    const { engine, provider } = createEngineHarness({
      routes: [createTestRoute('/'), createTestRoute('/about')],
    });

    await bootEngine(engine, '/');
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(provider.currentHref).toBe('/about');
    expect(provider.entries).toEqual(['/', '/about']);
  });

  it('calls onHashOnlyNavigation for hash-only navigateTo', async () => {
    const onHashOnlyNavigation = jest.fn();
    const { engine, provider } = createEngineHarness({
      href: '/docs',
      routes: [createTestRoute('/docs')],
      onHashOnlyNavigation,
    });

    await bootEngine(engine, '/docs');
    await engine.navigateTo('/docs#intro', 'push', { replace: false, syncHistory: true });

    expect(onHashOnlyNavigation).toHaveBeenCalledTimes(1);
    expect(onHashOnlyNavigation).toHaveBeenCalledWith('/docs#intro');
    expect(provider.currentHref).toBe('/docs#intro');
  });

  it('index folder: keeps URL without trailing slash on system navigate', async () => {
    const index = createDomRoute('.');
    const settings = createDomRoute('/app/settings', [index]);
    const { engine, provider } = createEngineHarness({
      href: '/app/settings',
      routes: collectRoutesFromDom(settings),
      startProvider: false,
    });

    engine.start();
    await bootEngine(engine, '/app/settings');

    expect(provider.currentHref).toBe('/app/settings');
  });

  it('clickLink проходит через engine и commit-ит URL', async () => {
    const { engine, provider } = createEngineHarness({
      routes: [createTestRoute('/'), createTestRoute('/about')],
    });

    await bootEngine(engine, '/');
    provider.clickLink('/about');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(provider.currentHref).toBe('/about');
  });

  it('stop pauses input; start resumes on the same engine', async () => {
    const { engine, provider } = createEngineHarness({
      routes: [createTestRoute('/'), createTestRoute('/about')],
      startProvider: false,
    });

    engine.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    engine.stop();
    expect(engine.isRunning).toBe(false);
    provider.clickLink('/about');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(provider.currentHref).toBe('/');

    engine.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(engine.isRunning).toBe(true);

    provider.clickLink('/about');

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(provider.currentHref).toBe('/about');

    engine.destroy();
  });

  it('destroy after stop clears provider handler', () => {
    const provider = new FakeHistoryProvider('/');
    const handler = jest.fn();
    provider.onNavigation(handler);
    provider.start();

    const { engine } = createEngineHarness({ provider, startProvider: false });
    engine.start();
    engine.stop();
    engine.destroy();

    provider.start();
    provider.clickLink('/x');
    expect(handler).not.toHaveBeenCalled();
  });

  it('при ошибке render вызывает onUnmount у from и коммитит URL', async () => {
    const fromLeft = jest.fn();
    const renderError = new Error('load failed');
    const fromRoute = createTestRoute('/a', { onUnmount: fromLeft });
    const toRoute = createTestRoute('/d', {
      resolveAndMountView: jest.fn().mockResolvedValue({ status: 'error', error: renderError }),
    });
    const { engine, provider } = createEngineHarness({
      href: '/a',
      routes: [fromRoute, toRoute],
      startProvider: false,
    });
    const errors = collectNavigationErrors(engine);

    engine.start();

    await bootEngine(engine, '/a');
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

    const { engine, provider } = createEngineHarness({
      href: '/a',
      routes: [fromRoute, toRoute],
      startProvider: false,
    });
    const errors = collectNavigationErrors(engine);

    engine.hooksRegistry.register(
      defineRouteHook('guard', async () => {
        throw enterError;
      }),
    );

    engine.start();

    try {
      await bootEngine(engine, '/a');
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

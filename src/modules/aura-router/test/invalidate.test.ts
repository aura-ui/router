/** @jest-environment jsdom */

import { AuraRouter } from '../core/aura-router';
import { installAuraRouter } from '../core/install';
import { AURA_ROUTER_DATA_INVALIDATED } from '../core/navigation-events';
import type { LoaderFn, RouteHookDefinition } from '../../aura-routing-engine/core';

describe('AuraRouter.invalidate', () => {
  beforeAll(() => {
    installAuraRouter();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    AuraRouter.unuse('fetch-items');
    AuraRouter.unuse('fetch-user');
  });

  async function mountRouter(html: string): Promise<AuraRouter> {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.innerHTML = html;
    document.body.append(router);
    await customElements.whenDefined('aura-route');
    router.refreshRoutes();
    return router;
  }

  /** Prefetched page with counted data + view loads. */
  async function mountCachedPage(loaderId: string) {
    let dataLoads = 0;
    let viewLoads = 0;

    AuraRouter.use({
      name: 'fetch-items',
      version: '1.0.0',
      fn: (async () => ({ n: ++dataLoads })) as unknown as RouteHookDefinition['fn'],
    });
    AuraRouter.registerLoader(
      loaderId,
      (async () => `<span>${++viewLoads}</span>`) as unknown as LoaderFn,
    );

    const router = await mountRouter(`
      <aura-route path="/page" load="fetch-items" cache="all" view="${loaderId}::x"></aura-route>
    `);
    await router.prefetch('/page');

    return {
      router,
      dataLoads: () => dataLoads,
      viewLoads: () => viewLoads,
    };
  }

  it('default clears data only', async () => {
    const { router, dataLoads, viewLoads } = await mountCachedPage('inv-default');
    expect(dataLoads()).toBe(1);
    expect(viewLoads()).toBe(1);

    router.invalidate({ policy: 'remove' });

    await router.prefetch('/page');
    expect(dataLoads()).toBe(2);
    expect(viewLoads()).toBe(1);
  });

  it('cache:view clears view only and skips data-invalidated', async () => {
    const { router, dataLoads, viewLoads } = await mountCachedPage('inv-view');
    const handler = jest.fn();
    router.addEventListener(AURA_ROUTER_DATA_INVALIDATED, handler);

    router.invalidate({ cache: 'view', policy: 'remove' });
    expect(handler).not.toHaveBeenCalled();

    await router.prefetch('/page');
    expect(viewLoads()).toBe(2);
    expect(dataLoads()).toBe(1);
  });

  it('cache:all clears both and dispatches data-invalidated', async () => {
    const { router, dataLoads, viewLoads } = await mountCachedPage('inv-all');
    const handler = jest.fn();
    router.addEventListener(AURA_ROUTER_DATA_INVALIDATED, handler);

    const count = router.invalidate({ cache: 'all', policy: 'remove' });
    expect(count).toBeGreaterThan(0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].detail.count).toBe(count);

    await router.prefetch('/page');
    expect(dataLoads()).toBe(2);
    expect(viewLoads()).toBe(2);
  });

  it('dispatches data-invalidated with -1 on empty data cache', async () => {
    const router = await mountRouter(`
      <aura-route path="/items" view="html::x"></aura-route>
    `);
    const handler = jest.fn();
    router.addEventListener(AURA_ROUTER_DATA_INVALIDATED, handler);

    expect(router.invalidate()).toBe(-1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].detail.count).toBe(-1);
  });

  it('path scopes data invalidate', async () => {
    let items = 0;
    let users = 0;
    AuraRouter.use({
      name: 'fetch-items',
      version: '1.0.0',
      fn: (async () => ({ n: ++items })) as unknown as RouteHookDefinition['fn'],
    });
    AuraRouter.use({
      name: 'fetch-user',
      version: '1.0.0',
      fn: (async () => ({ n: ++users })) as unknown as RouteHookDefinition['fn'],
    });

    const router = await mountRouter(`
      <aura-route path="/items" load="fetch-items" cache="data" view="html::a"></aura-route>
      <aura-route path="/profile" load="fetch-user" cache="data" view="html::b"></aura-route>
    `);
    await router.prefetch('/items');
    await router.prefetch('/profile');

    router.invalidate({ path: '/items', policy: 'remove' });

    await router.prefetch('/items');
    await router.prefetch('/profile');
    expect(items).toBe(2);
    expect(users).toBe(1);
  });
});

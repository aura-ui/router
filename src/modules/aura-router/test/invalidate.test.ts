/** @jest-environment jsdom */

import { AuraRouter } from '../core/aura-router';
import { registerAuraRouterComponents } from '../core/aura-router-setup';
import { AURA_ROUTER_DATA_INVALIDATED } from '../core/navigation-events';

describe('AuraRouter.invalidate', () => {
  beforeAll(() => {
    registerAuraRouterComponents();
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

  it('clears load cache so the next prefetch refetches', async () => {
    let loads = 0;
    AuraRouter.use({
      name: 'fetch-items',
      version: '1.0.0',
      fn: async () => {
        loads++;
        return { n: loads };
      },
    });

    const router = await mountRouter(`
      <aura-outlet></aura-outlet>
      <aura-route path="/items" load="fetch-items" cache="data" view="html::x"></aura-route>
    `);

    await router.prefetch('/items');
    expect(loads).toBe(1);

    await router.prefetch('/items');
    expect(loads).toBe(1);

    router.invalidate({ policy: 'remove' });

    await router.prefetch('/items');
    expect(loads).toBe(2);
  });

  it('dispatches data-invalidated', async () => {
    const router = await mountRouter(`
      <aura-outlet></aura-outlet>
      <aura-route path="/items" load="fetch-items" cache="data" view="html::x"></aura-route>
    `);

    const handler = jest.fn();
    router.addEventListener(AURA_ROUTER_DATA_INVALIDATED, handler);

    const count = router.invalidate();

    expect(count).toBe(-1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].detail.count).toBe(-1);
  });

  it('invalidates by path prefix', async () => {
    let itemLoads = 0;
    let userLoads = 0;

    AuraRouter.use({
      name: 'fetch-items',
      version: '1.0.0',
      fn: async () => {
        itemLoads++;
        return { items: itemLoads };
      },
    });
    AuraRouter.use({
      name: 'fetch-user',
      version: '1.0.0',
      fn: async () => {
        userLoads++;
        return { user: userLoads };
      },
    });

    const router = await mountRouter(`
      <aura-outlet></aura-outlet>
      <aura-route path="/items" load="fetch-items" cache="data" view="html::a"></aura-route>
      <aura-route path="/profile" load="fetch-user" cache="data" view="html::b"></aura-route>
    `);

    await router.prefetch('/items');
    await router.prefetch('/profile');
    expect(itemLoads).toBe(1);
    expect(userLoads).toBe(1);

    router.invalidate({ path: '/items', policy: 'remove' });

    await router.prefetch('/items');
    await router.prefetch('/profile');
    expect(itemLoads).toBe(2);
    expect(userLoads).toBe(1);
  });

  it('does not clear view-loader payload cache', async () => {
    let htmlLoads = 0;
    AuraRouter.registerLoader('html', async () => {
      htmlLoads++;
      return `<span>v${htmlLoads}</span>`;
    });

    const router = await mountRouter(`
      <aura-outlet></aura-outlet>
      <aura-route path="/page" view="html::x" cache="view"></aura-route>
    `);

    await router.viewGraph.loadView(
      {
        href: '/page',
        pathname: '/page',
        search: '',
        hash: '',
        pattern: '/page',
        route: router.routes[0] as never,
        resolvedView: { loader: 'html', content: 'x' },
      } as never,
      new AbortController().signal,
    );
    expect(htmlLoads).toBe(1);

    router.invalidate({ policy: 'remove' });

    await router.viewGraph.loadView(
      {
        href: '/page',
        pathname: '/page',
        search: '',
        hash: '',
        pattern: '/page',
        route: router.routes[0] as never,
        resolvedView: { loader: 'html', content: 'x' },
      } as never,
      new AbortController().signal,
    );
    expect(htmlLoads).toBe(1);
  });
});

describe('AuraRouter.invalidateView', () => {
  beforeAll(() => {
    registerAuraRouterComponents();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function mountRouter(html: string): Promise<AuraRouter> {
    const router = document.createElement(AuraRouter.is) as AuraRouter;
    router.innerHTML = html;
    document.body.append(router);
    await customElements.whenDefined('aura-route');
    router.refreshRoutes();
    return router;
  }

  it('clears payload cache without touching load hooks', async () => {
    let htmlLoads = 0;
    let dataLoads = 0;

    AuraRouter.registerLoader('html', async () => {
      htmlLoads++;
      return `<span>v${htmlLoads}</span>`;
    });
    AuraRouter.use({
      name: 'fetch-items',
      version: '1.0.0',
      fn: async () => {
        dataLoads++;
        return { n: dataLoads };
      },
    });

    const router = await mountRouter(`
      <aura-outlet></aura-outlet>
      <aura-route path="/page" load="fetch-items" cache="all" view="html::x"></aura-route>
    `);

    await router.prefetch('/page');
    expect(htmlLoads).toBe(1);
    expect(dataLoads).toBe(1);

    router.invalidateView({ policy: 'remove' });

    await router.prefetch('/page');
    expect(htmlLoads).toBe(2);
    expect(dataLoads).toBe(1);
  });
});

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_CACHE, type MatchedRouteInfo } from '../../../aura-routing-engine/core';
import type { AuraRouteInterface, RouteRenderOptions } from '../../core/types';
import { RouteViewController } from '../../core/view';
import { RouteDomCache, destroyViewRoot, domCacheKey } from '../../core/view/dom-cache';
import type { ViewResolverPort, DomCachePort } from '../../core/view/types';
import {
  createMatchedRouteInfo,
  createMockDomCache,
  createNoopDomCache,
  createOutlet,
  createRouteStub,
  defineAuraOutlet,
  layoutWithOutlet,
} from '../_helpers';

function createController(
  path: string,
  outlets: { root: () => AuraOutlet; mount?: (route?: MatchedRouteInfo) => AuraOutlet | null },
  view: ViewResolverPort,
  domCache: DomCachePort,
  cacheDom = true,
): RouteViewController {
  let passId = 0;
  const route = createRouteStub({
    path,
    cache: cacheDom ? { dom: true, view: false, data: false } : NO_CACHE,
  });

  const controller = new RouteViewController(
    {
      route,
      view,
      cache: domCache,
      mountTarget: {
        appOutlet: outlets.root,
        nestedOutlet: outlets.mount ?? (() => null),
      },
    },
    () => passId,
  );

  const originalOnUnmount = controller.onUnmount.bind(controller);
  controller.onUnmount = (options) => {
    passId++;
    originalOnUnmount(options);
  };

  const originalRender = controller.resolveAndMountView.bind(controller);
  controller.resolveAndMountView = async (...args) => {
    passId++;
    return originalRender(...args);
  };

  return controller;
}

describe('RouteViewController keep-alive integration', () => {
  beforeAll(() => {
    defineAuraOutlet();
  });

  afterEach(() => {
    document.body.replaceChildren();
    RouteDomCache.configure({ max: 10, gcTime: Infinity, gcSweepInterval: false });
  });

  it('stashes under pathname when render is skipped', async () => {
    const stash = new Map<string, Element>();
    const domCache = createMockDomCache(stash);
    const controller = createController(
      'user/:id',
      { root: createOutlet },
      { loadView: async () => ({ payload: '<span>view</span>' }) },
      domCache,
    );

    const route = createMatchedRouteInfo('/user/1', { pattern: '/user/:id' });

    await controller.resolveAndMountView(route);
    await controller.resolveAndMountView(route);
    controller.onUnmount();

    expect(stash.has(domCacheKey(route, 'user/:id'))).toBe(true);
    expect(stash.has('user/:id')).toBe(false);
  });

  it('isolates stash keys by query string', async () => {
    const stash = new Map<string, Element>();
    const domCache = createMockDomCache(stash);
    let resolveCount = 0;
    const root = createOutlet();

    const controller = createController(
      'search',
      { root: () => root },
      {
        loadView: async () => {
          resolveCount++;
          return { payload: `<span>result-${resolveCount}</span>` };
        },
      },
      domCache,
    );

    const routeA = createMatchedRouteInfo('/search', { query: { q: 'a' }, pattern: '/search' });
    const routeB = createMatchedRouteInfo('/search', { query: { q: 'b' }, pattern: '/search' });
    const keyA = domCacheKey(routeA, 'search');
    const keyB = domCacheKey(routeB, 'search');

    await controller.resolveAndMountView(routeA);
    controller.onUnmount();
    expect(stash.has(keyA)).toBe(true);
    expect(keyA).toBe('/search|q=a');

    await controller.resolveAndMountView(routeB);
    expect(resolveCount).toBe(2);
    expect(stash.has(keyB)).toBe(false);

    controller.onUnmount();
    expect(stash.has(keyA)).toBe(true);
    expect(stash.has(keyB)).toBe(true);
    expect(keyA).not.toBe(keyB);

    await controller.resolveAndMountView(routeA);
    expect(resolveCount).toBe(2);
    expect(root.textContent).toBe('result-1');
  });

  it('reattaches child view in parent outlet slot from stash', async () => {
    const stash = new Map<string, Element>();
    const domCache = createMockDomCache(stash);
    const root = createOutlet();

    const parent = createController(
      'users',
      { root: () => root },
      { loadView: async () => ({ payload: layoutWithOutlet().fragment }) },
      domCache,
    );

    const child = createController(
      ':id',
      {
        root: () => root,
        mount: () => parent.nestedOutlet,
      },
      { loadView: async () => ({ payload: '<span id="child-view">child</span>' }) },
      domCache,
    );

    await parent.resolveAndMountView(createMatchedRouteInfo('/users', { pattern: '/users' }));

    const childRoute = createMatchedRouteInfo('/users/42', { pattern: '/users/:id' });
    await child.resolveAndMountView(childRoute);
    expect(parent.nestedOutlet?.querySelector('#child-view')).not.toBeNull();

    child.onUnmount();
    expect(stash.has(domCacheKey(childRoute, ':id'))).toBe(true);

    let resolveAfterStash = 0;
    const childAgain = createController(
      ':id',
      {
        root: () => root,
        mount: () => parent.nestedOutlet,
      },
      {
        loadView: async () => {
          resolveAfterStash++;
          return { payload: '<span id="child-view">fresh</span>' };
        },
      },
      domCache,
    );

    await childAgain.resolveAndMountView(childRoute);
    expect(resolveAfterStash).toBe(0);
    expect(parent.nestedOutlet?.querySelector('#child-view')?.textContent).toBe('child');
  });

  it('LRU eviction destroys detached DOM via onRemove', async () => {
    const evicted: Element[] = [];
    RouteDomCache.configure({
      max: 2,
      gcTime: Infinity,
      gcSweepInterval: false,
      onRemove: (_key, root) => {
        evicted.push(root);
        destroyViewRoot(root);
      },
    });

    const domCache = new RouteDomCache();
    const root = createOutlet();

    async function visit(pathname: string, attrPath: string): Promise<void> {
      const controller = createController(
        attrPath,
        { root: () => root },
        { loadView: async () => ({ payload: `<span>${pathname}</span>` }) },
        domCache,
      );
      await controller.resolveAndMountView(createMatchedRouteInfo(pathname, { pattern: attrPath }));
      controller.onUnmount();
    }

    await visit('/a', 'a');
    await visit('/b', 'b');
    await visit('/c', 'c');

    expect(evicted).toHaveLength(1);
    expect(domCache.extract(domCacheKey(createMatchedRouteInfo('/a', { pattern: 'a' }), 'a'))).toBeUndefined();
    expect(domCache.extract(domCacheKey(createMatchedRouteInfo('/b', { pattern: 'b' }), 'b'))).toBeDefined();
    expect(domCache.extract(domCacheKey(createMatchedRouteInfo('/c', { pattern: 'c' }), 'c'))).toBeDefined();
    expect(evicted[0]?.isConnected).toBe(false);
  });

  it('param-change onUnmount preserves active view after remount', async () => {
    const root = createOutlet();
    let resolveCount = 0;
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async () => ({ payload: `<span>view-${++resolveCount}</span>` }) },
      createMockDomCache(),
      false,
    );

    const route1 = createMatchedRouteInfo('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = createMatchedRouteInfo('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.resolveAndMountView(route1);
    expect(root.textContent).toBe('view-1');

    await controller.resolveAndMountView(route2, { paramChangeRemount: true });
    expect(root.textContent).toBe('view-2');

    controller.onUnmount();
    expect(root.textContent).toBe('view-2');
    expect(root.children).toHaveLength(1);
  });

  it('isViewAlreadyInOutlet skips re-render for same target with cache.dom', async () => {
    const root = createOutlet();
    let resolveCount = 0;
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async () => ({ payload: `<span>view-${++resolveCount}</span>` }) },
      createMockDomCache(),
      true,
    );

    const route1 = createMatchedRouteInfo('/user/1', { pattern: '/user/:id', params: { id: '1' } });

    await controller.resolveAndMountView(route1);
    await controller.resolveAndMountView(route1);

    expect(resolveCount).toBe(1);
    expect(root.textContent).toBe('view-1');
  });

  it('param-change remount re-renders despite cache.dom and active mount', async () => {
    const root = createOutlet();
    let resolveCount = 0;
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async () => ({ payload: `<span>view-${++resolveCount}</span>` }) },
      createMockDomCache(),
      true,
    );

    const route1 = createMatchedRouteInfo('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = createMatchedRouteInfo('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.resolveAndMountView(route1);
    await controller.resolveAndMountView(route2, { paramChangeRemount: true });
    controller.commitStagedView();

    expect(resolveCount).toBe(2);
    expect(root.textContent).toBe('view-2');
  });

  it('onUnmount without paramChangeRemount clears view after param swap', async () => {
    const root = createOutlet();
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async (info) => ({ payload: `<span>view-${info.params?.id}</span>` }) },
      createMockDomCache(),
      false,
    );

    const route1 = createMatchedRouteInfo('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = createMatchedRouteInfo('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.resolveAndMountView(route1);
    await controller.resolveAndMountView(route2);
    expect(root.textContent).toBe('view-2');

    controller.onUnmount();
    expect(root.children).toHaveLength(0);
  });

  it('staged param-change remount stashes outgoing DOM before commit when cache.dom', async () => {
    const root = createOutlet();
    const stash = new Map<string, Element>();
    const domCache = createMockDomCache(stash);
    let resolveCount = 0;
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async () => ({ payload: `<span>view-${++resolveCount}</span>` }) },
      domCache,
      true,
    );

    const route1 = createMatchedRouteInfo('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = createMatchedRouteInfo('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.resolveAndMountView(route1);
    await controller.resolveAndMountView(route2, { paramChangeRemount: true });

    expect(root.children).toHaveLength(2);

    controller.onUnmount({ domCacheKey: domCacheKey(route1, 'user/:id') });

    expect(root.textContent).toBe('view-2');
    expect(root.children).toHaveLength(1);
    expect(stash.has('/user/1')).toBe(true);
    expect(stash.get('/user/1')?.textContent).toBe('view-1');
  });

  it('param-change remount with parallel transition stages both views; param unmount keeps incoming', async () => {
    const root = createOutlet();
    const route = createRouteStub({
      path: 'user/:id',
      transition: { order: 'parallel' as const, in: null, out: null },
    });

    const controller = new RouteViewController(
      {
        route,
        view: {
          loadView: async (info) => ({
            payload: `<span data-id="${info.params?.id}">view-${info.params?.id}</span>`,
          }),
        },
        cache: createMockDomCache(),
        mountTarget: { appOutlet: () => root, nestedOutlet: () => null },
      },
      () => 1,
    );

    const route1 = createMatchedRouteInfo('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = createMatchedRouteInfo('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.resolveAndMountView(route1);
    await controller.resolveAndMountView(route2, { paramChangeRemount: true });

    expect(root.children).toHaveLength(2);
    expect(root.querySelector('[data-id="1"]')).not.toBeNull();
    expect(root.querySelector('[data-id="2"]')).not.toBeNull();

    controller.onUnmount({ domCacheKey: domCacheKey(route1, 'user/:id') });

    expect(root.children).toHaveLength(1);
    expect(root.querySelector('[data-id="2"]')).not.toBeNull();
    expect(root.textContent).toBe('view-2');

    controller.commitStagedView();
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('view-2');
  });

  it('mountResolvedView mounts content without calling view.loadView', () => {
    const root = createOutlet();
    const resolve = jest.fn(async () => ({ payload: '<span>from-resolve</span>' }));
    const controller = createController(
      '/page',
      { root: () => root },
      { loadView: resolve },
      createMockDomCache(),
      false,
    );

    const result = controller.mountResolvedView(createMatchedRouteInfo('/page'), {
      preResolvedView: '<span>instant</span>',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(resolve).not.toHaveBeenCalled();
    expect(root.textContent).toBe('instant');
  });

  it('sync-mounts pre-resolved layout and child in nested outlet', () => {
    const root = createOutlet();
    const resolve = jest.fn();

    const parent = createController(
      'users',
      { root: () => root },
      { loadView: resolve },
      createMockDomCache(),
      false,
    );

    const child = createController(
      ':id',
      {
        root: () => root,
        mount: () => parent.nestedOutlet,
      },
      { loadView: resolve },
      createMockDomCache(),
      false,
    );

    parent.mountResolvedView(createMatchedRouteInfo('/users', { pattern: '/users' }), {
      preResolvedView: layoutWithOutlet().fragment,
    });
    child.mountResolvedView(createMatchedRouteInfo('/users/1', { pattern: '/users/:id' }), {
      preResolvedView: '<span>user-list</span>',
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(root.querySelector('header')).not.toBeNull();
    expect(parent.nestedOutlet?.textContent).toBe('user-list');
  });
});

async function captureUseStagedMount(
  config: AuraRouteInterface,
  routeInfo: MatchedRouteInfo,
  options?: RouteRenderOptions,
): Promise<boolean | undefined> {
  const outlet = createOutlet();

  let useStagedMount: boolean | undefined;

  const controller = new RouteViewController(
    {
      route: config,
      view: { loadView: async () => ({ payload: '<span>view</span>' }) },
      cache: createNoopDomCache(),
      mountTarget: { appOutlet: () => outlet, nestedOutlet: () => null },
      plugins: [{
        onContentResolved(pass) {
          useStagedMount = pass.useStagedMount;
        },
      }],
    },
    () => 1,
  );

  await controller.resolveAndMountView(routeInfo, options);
  return useStagedMount;
}

describe('RouteViewController useStagedMount', () => {
  it('stages when route declares transition order', async () => {
    const value = await captureUseStagedMount(
      createRouteStub({
        path: 'user/:id',
        transition: { order: 'parallel', in: ['fade'], out: ['fade'] },
      }),
      createMatchedRouteInfo('/users/1', { pattern: 'user/:id' }),
    );

    expect(value).toBe(true);
  });

  it('stages on param-change remount with cache.dom', async () => {
    const value = await captureUseStagedMount(
      createRouteStub({
        path: 'user/:id',
        cache: { dom: true, view: false, data: false },
      }),
      createMatchedRouteInfo('/users/2', { pattern: 'user/:id' }),
      { paramChangeRemount: true },
    );

    expect(value).toBe(true);
  });

  it('replaces on param-change remount without cache.dom', async () => {
    const value = await captureUseStagedMount(
      createRouteStub({ path: 'user/:id', cache: NO_CACHE }),
      createMatchedRouteInfo('/users/2', { pattern: 'user/:id' }),
      { paramChangeRemount: true },
    );

    expect(value).toBe(false);
  });

  it('replaces on ordinary navigation without transition', async () => {
    const value = await captureUseStagedMount(
      createRouteStub({
        path: 'user/:id',
        cache: { dom: true, view: false, data: false },
      }),
      createMatchedRouteInfo('/users/2', { pattern: 'user/:id' }),
    );

    expect(value).toBe(false);
  });
});

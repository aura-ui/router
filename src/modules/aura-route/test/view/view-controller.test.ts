import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_CACHE, type MatchedRouteInfo } from '../../../aura-routing-engine/core';
import { RouteViewController } from '../../core/view';
import { RouteDomCache, destroyViewRoot, domCacheKey } from '../../core/view/dom-cache';
import { NO_TRANSITION } from '../../core/attr/transition-attr-parser';
import type { AuraRouteInterface, RouteRenderOptions } from '../../core/types';
import type { ViewResolverPort, DomCachePort } from '../../core/view/types';

function createOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

function matched(pathname: string, overrides: Partial<MatchedRouteInfo> = {}): MatchedRouteInfo {
  return {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: pathname,
    ...overrides,
  } as MatchedRouteInfo;
}

function createMockViewCache(stash = new Map<string, Element>()): DomCachePort {
  return {
    extract: (key) => {
      const root = stash.get(key);
      if (root) stash.delete(key);
      return root as HTMLElement;
    },
    put: (key, root) => stash.set(key, root),
  };
}

function createController(
  path: string,
  outlets: { root: () => AuraOutlet; mount?: (route?: MatchedRouteInfo) => AuraOutlet | null },
  view: ViewResolverPort,
  viewCache: DomCachePort,
  cacheDom = true,
): RouteViewController {
  let passId = 0;
  const route = {
    path,
    layout: '',
    view: null,
    loadingTemplate: '',
    errorTemplate: '',
    scrollPolicy: null,
    cache: cacheDom ? { dom: true, view: false, data: false } : NO_CACHE,
    transition: NO_TRANSITION,
  } as AuraRouteInterface;

  const controller = new RouteViewController(
    {
      route,
      view,
      cache: viewCache,
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

  const originalRender = controller.render.bind(controller);
  controller.render = async (...args) => {
    passId++;
    return originalRender(...args);
  };

  return controller;
}

function layoutShell(): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const nested = document.createElement(AuraOutlet.is);
  fragment.append(document.createElement('header'), nested);
  return fragment;
}

describe('RouteViewController keep-alive integration', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
    RouteDomCache.configure({ max: 10, gcTime: Infinity, gcSweepInterval: false });
  });

  it('stashes under pathname when render is skipped', async () => {
    const stash = new Map<string, Element>();
    const viewCache = createMockViewCache(stash);
    const controller = createController(
      'user/:id',
      { root: createOutlet },
      { loadView: async () => ({ data: '<span>view</span>' }) },
      viewCache,
    );

    const route = matched('/user/1', { pattern: '/user/:id' });

    await controller.render(route);
    await controller.render(route);
    controller.onUnmount();

    expect(stash.has(domCacheKey(route, 'user/:id'))).toBe(true);
    expect(stash.has('user/:id')).toBe(false);
  });

  it('isolates stash keys by query string', async () => {
    const stash = new Map<string, Element>();
    const viewCache = createMockViewCache(stash);
    let resolveCount = 0;
    const root = createOutlet();

    const controller = createController(
      'search',
      { root: () => root },
      {
        loadView: async () => {
          resolveCount++;
          return { data: `<span>result-${resolveCount}</span>` };
        },
      },
      viewCache,
    );

    const routeA = matched('/search', { query: { q: 'a' }, pattern: '/search' });
    const routeB = matched('/search', { query: { q: 'b' }, pattern: '/search' });
    const keyA = domCacheKey(routeA, 'search');
    const keyB = domCacheKey(routeB, 'search');

    await controller.render(routeA);
    controller.onUnmount();
    expect(stash.has(keyA)).toBe(true);
    expect(keyA).toBe('/search|q=a');

    await controller.render(routeB);
    expect(resolveCount).toBe(2);
    expect(stash.has(keyB)).toBe(false);

    controller.onUnmount();
    expect(stash.has(keyA)).toBe(true);
    expect(stash.has(keyB)).toBe(true);
    expect(keyA).not.toBe(keyB);

    await controller.render(routeA);
    expect(resolveCount).toBe(2);
    expect(root.textContent).toBe('result-1');
  });

  it('reattaches child view in parent outlet slot from stash', async () => {
    const stash = new Map<string, Element>();
    const viewCache = createMockViewCache(stash);
    const root = createOutlet();

    const parent = createController(
      'users',
      { root: () => root },
      { loadView: async () => ({ data: layoutShell() }) },
      viewCache,
    );

    const child = createController(
      ':id',
      {
        root: () => root,
        mount: () => parent.nestedOutlet,
      },
      { loadView: async () => ({ data: '<span id="child-view">child</span>' }) },
      viewCache,
    );

    await parent.render(matched('/users', { pattern: '/users' }));

    const childRoute = matched('/users/42', { pattern: '/users/:id' });
    await child.render(childRoute);
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
          return { data: '<span id="child-view">fresh</span>' };
        },
      },
      viewCache,
    );

    await childAgain.render(childRoute);
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

    const viewCache = new RouteDomCache();
    const root = createOutlet();

    async function visit(pathname: string, attrPath: string): Promise<void> {
      const controller = createController(
        attrPath,
        { root: () => root },
        { loadView: async () => ({ data: `<span>${pathname}</span>` }) },
        viewCache,
      );
      await controller.render(matched(pathname, { pattern: attrPath }));
      controller.onUnmount();
    }

    await visit('/a', 'a');
    await visit('/b', 'b');
    await visit('/c', 'c');

    expect(evicted).toHaveLength(1);
    expect(viewCache.extract(domCacheKey(matched('/a', { pattern: 'a' }), 'a'))).toBeUndefined();
    expect(viewCache.extract(domCacheKey(matched('/b', { pattern: 'b' }), 'b'))).toBeDefined();
    expect(viewCache.extract(domCacheKey(matched('/c', { pattern: 'c' }), 'c'))).toBeDefined();
    expect(evicted[0]?.isConnected).toBe(false);
  });

  it('param-change onUnmount preserves active view after remount', async () => {
    const root = createOutlet();
    let resolveCount = 0;
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async () => ({ data: `<span>view-${++resolveCount}</span>` }) },
      createMockViewCache(),
      false,
    );

    const route1 = matched('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = matched('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.render(route1);
    expect(root.textContent).toBe('view-1');

    await controller.render(route2, { paramChangeRemount: true });
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
      { loadView: async () => ({ data: `<span>view-${++resolveCount}</span>` }) },
      createMockViewCache(),
      true,
    );

    const route1 = matched('/user/1', { pattern: '/user/:id', params: { id: '1' } });

    await controller.render(route1);
    await controller.render(route1);

    expect(resolveCount).toBe(1);
    expect(root.textContent).toBe('view-1');
  });

  it('param-change remount re-renders despite cache.dom and active mount', async () => {
    const root = createOutlet();
    let resolveCount = 0;
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async () => ({ data: `<span>view-${++resolveCount}</span>` }) },
      createMockViewCache(),
      true,
    );

    const route1 = matched('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = matched('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.render(route1);
    await controller.render(route2, { paramChangeRemount: true });
    controller.commitStagedView();

    expect(resolveCount).toBe(2);
    expect(root.textContent).toBe('view-2');
  });

  it('onUnmount without paramChangeRemount clears view after param swap', async () => {
    const root = createOutlet();
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async (info) => ({ data: `<span>view-${info.params?.id}</span>` }) },
      createMockViewCache(),
      false,
    );

    const route1 = matched('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = matched('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.render(route1);
    await controller.render(route2);
    expect(root.textContent).toBe('view-2');

    controller.onUnmount();
    expect(root.children).toHaveLength(0);
  });

  it('staged param-change remount stashes outgoing DOM before commit when cache.dom', async () => {
    const root = createOutlet();
    const stash = new Map<string, Element>();
    const viewCache = createMockViewCache(stash);
    let resolveCount = 0;
    const controller = createController(
      'user/:id',
      { root: () => root },
      { loadView: async () => ({ data: `<span>view-${++resolveCount}</span>` }) },
      viewCache,
      true,
    );

    const route1 = matched('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = matched('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.render(route1);
    await controller.render(route2, { paramChangeRemount: true });

    expect(root.children).toHaveLength(2);

    controller.onUnmount({ domCacheKey: domCacheKey(route1, 'user/:id') });

    expect(root.textContent).toBe('view-2');
    expect(root.children).toHaveLength(1);
    expect(stash.has('/user/1')).toBe(true);
    expect(stash.get('/user/1')?.textContent).toBe('view-1');
  });

  it('param-change remount with parallel transition stages both views; param unmount keeps incoming', async () => {
    const root = createOutlet();
    const route = {
      path: 'user/:id',
      layout: '',
      view: null,
      loadingTemplate: '',
      errorTemplate: '',
      scrollPolicy: null,
      cache: NO_CACHE,
      transition: { order: 'parallel' as const, in: null, out: null },
    } as AuraRouteInterface;

    const controller = new RouteViewController(
      {
        route,
        view: {
          loadView: async (info) => ({
            data: `<span data-id="${info.params?.id}">view-${info.params?.id}</span>`,
          }),
        },
        cache: createMockViewCache(),
        mountTarget: { appOutlet: () => root, nestedOutlet: () => null },
      },
      () => 1,
    );

    const route1 = matched('/user/1', { pattern: '/user/:id', params: { id: '1' } });
    const route2 = matched('/user/2', { pattern: '/user/:id', params: { id: '2' } });

    await controller.render(route1);
    await controller.render(route2, { paramChangeRemount: true });

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

  it('applyPreResolved mounts content without calling content.loadView', () => {
    const root = createOutlet();
    const resolve = jest.fn(async () => ({ data: '<span>from-resolve</span>' }));
    const controller = createController(
      '/page',
      { root: () => root },
      { loadView: resolve },
      createMockViewCache(),
      false,
    );

    const result = controller.applyPreResolved(matched('/page'), {
      preResolvedContent: '<span>instant</span>',
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
      createMockViewCache(),
      false,
    );

    const child = createController(
      ':id',
      {
        root: () => root,
        mount: () => parent.nestedOutlet,
      },
      { loadView: resolve },
      createMockViewCache(),
      false,
    );

    parent.applyPreResolved(matched('/users', { pattern: '/users' }), {
      preResolvedContent: layoutShell(),
    });
    child.applyPreResolved(matched('/users/1', { pattern: '/users/:id' }), {
      preResolvedContent: '<span>user-list</span>',
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(root.querySelector('header')).not.toBeNull();
    expect(parent.nestedOutlet?.textContent).toBe('user-list');
  });
});

function matchedUser(pathname: string): MatchedRouteInfo {
  return {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: 'user/:id',
  } as MatchedRouteInfo;
}

function routeConfig(overrides: Partial<AuraRouteInterface> = {}): AuraRouteInterface {
  return {
    path: 'user/:id',
    layout: '',
    redirect: '',
    view: null,
    loadingTemplate: '',
    errorTemplate: '',
    scrollPolicy: null,
    cache: NO_CACHE,
    transition: NO_TRANSITION,
    type: 'page',
    hasLayout: false,
    hasViewContent: false,
    hasGuard: false,
    hasLeave: false,
    hasLoad: false,
    hasTransitionIn: false,
    hasReady: false,
    hasAsyncContent: false,
    hasSyncContent: false,
    ...overrides,
  };
}

async function captureUseStagedMount(
  config: AuraRouteInterface,
  routeInfo: MatchedRouteInfo,
  options?: RouteRenderOptions,
): Promise<boolean | undefined> {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);

  let useStagedMount: boolean | undefined;

  const controller = new RouteViewController(
    {
      route: config,
      view: { loadView: async () => ({ data: '<span>view</span>' }) },
      cache: { extract: () => undefined, put: () => {} },
      mountTarget: { appOutlet: () => outlet, nestedOutlet: () => null },
      plugins: [{
        onContentResolved(pass) {
          useStagedMount = pass.useStagedMount;
        },
      }],
    },
    () => 1,
  );

  await controller.render(routeInfo, options);
  return useStagedMount;
}

describe('RouteViewController useStagedMount', () => {
  it('stages when route declares transition order', async () => {
    const value = await captureUseStagedMount(
      routeConfig({ transition: { order: 'parallel', in: ['fade'], out: ['fade'] } }),
      matchedUser('/users/1'),
    );

    expect(value).toBe(true);
  });

  it('stages on param-change remount with cache.dom', async () => {
    const value = await captureUseStagedMount(
      routeConfig({ cache: { dom: true, view: false, data: false } }),
      matchedUser('/users/2'),
      { paramChangeRemount: true },
    );

    expect(value).toBe(true);
  });

  it('replaces on param-change remount without cache.dom', async () => {
    const value = await captureUseStagedMount(
      routeConfig({ cache: NO_CACHE }),
      matchedUser('/users/2'),
      { paramChangeRemount: true },
    );

    expect(value).toBe(false);
  });

  it('replaces on ordinary navigation without transition', async () => {
    const value = await captureUseStagedMount(
      routeConfig({ cache: { dom: true, view: false, data: false } }),
      matchedUser('/users/2'),
    );

    expect(value).toBe(false);
  });
});

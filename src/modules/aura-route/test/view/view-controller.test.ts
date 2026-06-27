import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo } from '../../../aura-routing-engine/core';
import { RouteViewController } from '../../core/view/view-controller';
import { RouteViewCache, destroyViewRoot, cacheKey } from '../../core/view/view-cache';
import { NO_PRESERVE } from '../../../aura-routing-engine/core/content/preserve';
import { NO_TRANSITION } from '../../core/transition/transition';
import type { ContentResolverPort, ViewCachePort } from '../../core/view/ports';

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

function createMockViewCache(stash = new Map<string, Element>()): ViewCachePort {
  return {
    extract: (key) => {
      const root = stash.get(key);
      if (root) stash.delete(key);
      return root;
    },
    put: (key, root) => stash.set(key, root),
  };
}

function createController(
  path: string,
  outlets: { root: () => AuraOutlet; mount?: (route?: MatchedRouteInfo) => AuraOutlet | null },
  content: ContentResolverPort,
  viewCache: ViewCachePort,
  preserveView = true,
): RouteViewController {
  let passId = 0;
  const route = {
    path,
    layout: '',
    view: '',
    loadingTemplate: '',
    errorTemplate: '',
    restoreScroll: false,
    preserve: preserveView ? { view: true, data: false } : NO_PRESERVE,
    transition: NO_TRANSITION,
  };

  const controller = new RouteViewController(
    {
      route,
      content,
      cache: viewCache,
      mountTarget: {
        appOutlet: outlets.root,
        nestedOutlet: outlets.mount ?? (() => null),
      },
    },
    () => passId,
  );

  const originalOnLeft = controller.onLeft.bind(controller);
  controller.onLeft = () => {
    passId++;
    originalOnLeft();
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
    RouteViewCache.configure({ max: 10, gcTime: Infinity, gcSweepInterval: false });
  });

  it('stashes under pathname when render is skipped', async () => {
    const stash = new Map<string, Element>();
    const viewCache = createMockViewCache(stash);
    const controller = createController(
      'user/:id',
      { root: createOutlet },
      { resolve: async () => '<span>view</span>' },
      viewCache,
    );

    const route = matched('/user/1', { pattern: '/user/:id' });

    await controller.render(route);
    await controller.render(route);
    controller.onLeft();

    expect(stash.has(cacheKey(route, 'user/:id'))).toBe(true);
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
        resolve: async () => {
          resolveCount++;
          return `<span>result-${resolveCount}</span>`;
        },
      },
      viewCache,
    );

    const routeA = matched('/search', { query: { q: 'a' }, pattern: '/search' });
    const routeB = matched('/search', { query: { q: 'b' }, pattern: '/search' });
    const keyA = cacheKey(routeA, 'search');
    const keyB = cacheKey(routeB, 'search');

    await controller.render(routeA);
    controller.onLeft();
    expect(stash.has(keyA)).toBe(true);
    expect(keyA).toBe('/search|q=a');

    await controller.render(routeB);
    expect(resolveCount).toBe(2);
    expect(stash.has(keyB)).toBe(false);

    controller.onLeft();
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
      { resolve: async () => layoutShell() },
      viewCache,
    );

    const child = createController(
      ':id',
      {
        root: () => root,
        mount: () => parent.nestedOutlet,
      },
      { resolve: async () => '<span id="child-view">child</span>' },
      viewCache,
    );

    await parent.render(matched('/users', { pattern: '/users' }));

    const childRoute = matched('/users/42', { pattern: '/users/:id' });
    await child.render(childRoute);
    expect(parent.nestedOutlet?.querySelector('#child-view')).not.toBeNull();

    child.onLeft();
    expect(stash.has(cacheKey(childRoute, ':id'))).toBe(true);

    let resolveAfterStash = 0;
    const childAgain = createController(
      ':id',
      {
        root: () => root,
        mount: () => parent.nestedOutlet,
      },
      {
        resolve: async () => {
          resolveAfterStash++;
          return '<span id="child-view">fresh</span>';
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
    RouteViewCache.configure({
      max: 2,
      gcTime: Infinity,
      gcSweepInterval: false,
      onRemove: (_key, root) => {
        evicted.push(root);
        destroyViewRoot(root);
      },
    });

    const viewCache = new RouteViewCache();
    const root = createOutlet();

    async function visit(pathname: string, attrPath: string): Promise<void> {
      const controller = createController(
        attrPath,
        { root: () => root },
        { resolve: async () => `<span>${pathname}</span>` },
        viewCache,
      );
      await controller.render(matched(pathname, { pattern: attrPath }));
      controller.onLeft();
    }

    await visit('/a', 'a');
    await visit('/b', 'b');
    await visit('/c', 'c');

    expect(evicted).toHaveLength(1);
    expect(viewCache.extract(cacheKey(matched('/a', { pattern: 'a' }), 'a'))).toBeUndefined();
    expect(viewCache.extract(cacheKey(matched('/b', { pattern: 'b' }), 'b'))).toBeDefined();
    expect(viewCache.extract(cacheKey(matched('/c', { pattern: 'c' }), 'c'))).toBeDefined();
    expect(evicted[0]?.isConnected).toBe(false);
  });
});

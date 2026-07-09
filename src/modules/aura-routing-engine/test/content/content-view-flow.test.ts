/** @jest-environment jsdom */

import {
  AuraRoutingEngine,
  payloadCacheKey,
  PayloadCache,
} from '../../core';
import {
  ContentGraph,
  LoaderRegistry,
} from '../../core/content-graph';
import type { RouterInstance } from '../../core';
import { collectRoutesFromDom, createDomRoute } from '../helpers/test-route-dom';
import { withResolvedView } from '../helpers/with-resolved-view';

describe('content graph flow (view → engine)', () => {
  const routerNav: RouterInstance = { navigate: jest.fn() };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolve reads view from upgraded aura-route', async () => {
    const registry = new LoaderRegistry(undefined, []);
    const loads: string[] = [];
    registry.register('url', async (ctx) => {
      loads.push(ctx.ref);
      return `<p>${ctx.ref}</p>`;
    });

    const contentGraph = new ContentGraph({ registry, cache: new PayloadCache() });
    const route = createDomRoute('/feed');
    route.setAttribute('view', 'url::feed.html');

    await contentGraph.loadView(
      withResolvedView({
        href: '/feed',
        pathname: '/feed',
        search: '',
        hash: '',
        pattern: '/feed',
        route,
      }),
      new AbortController().signal,
    );
    expect(loads).toEqual(['feed.html']);
  });

  it('prefetch loads via live route attrs', async () => {
    const registry = new LoaderRegistry(undefined, []);
    const loads: string[] = [];
    registry.register('url', async (ctx) => {
      loads.push(ctx.ref);
      return `<p>${ctx.ref}</p>`;
    });

    const contentGraph = new ContentGraph({ registry, cache: new PayloadCache() });

    const about = createDomRoute('/about');
    about.setAttribute('view', 'url::about.html');

    const engine = new AuraRoutingEngine(routerNav, { contentGraph });
    engine.replaceRoutes(collectRoutesFromDom(about) as never);
    await engine.prefetch('/about');

    expect(loads).toEqual(['about.html']);
  });

  it('navigation render loads view via ContentGraph.loadView', async () => {
    const registry = new LoaderRegistry(undefined, []);
    const loads: string[] = [];
    registry.register('html', async (ctx) => {
      loads.push(ctx.ref);
      return ctx.ref;
    });

    const contentGraph = new ContentGraph({ registry, cache: new PayloadCache() });

    const route = createDomRoute('/x');
    route.setAttribute('view', 'html::<b>page</b>');

    await contentGraph.loadView(
      withResolvedView({
        href: '/x',
        pathname: '/x',
        search: '',
        hash: '',
        pattern: '/x',
        route: route as never,
      }),
      new AbortController().signal,
    );

    expect(loads).toEqual(['<b>page</b>']);
  });

  it('prefetch and navigation share payloadCacheKey when preserve view is enabled', async () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.register('url', async () => '<p>feed</p>');

    const cache = new PayloadCache();
    const contentGraph = new ContentGraph({ registry, cache });
    const route = createDomRoute('/feed');
    route.setAttribute('view', 'url::feed.html');
    route.setAttribute('preserve', 'view');

    const routeInfo = withResolvedView({
      href: '/feed',
      pathname: '/feed',
      search: '',
      hash: '',
      pattern: '/feed',
      route,
    });

    await contentGraph.loadView(routeInfo, new AbortController().signal);
    expect(cache.get(payloadCacheKey({
      kind: 'content',
      loader: 'url',
      ref: 'feed.html',
      cache: true,
    }, routeInfo))).toBeDefined();
  });

  it('layout route uses template loader from layout attr, not view', async () => {
    const registry = new LoaderRegistry(undefined, []);
    const loads: string[] = [];
    registry.register('template', async (ctx) => {
      loads.push(ctx.ref);
      return `<layout>${ctx.ref}</layout>`;
    });

    const contentGraph = new ContentGraph({ registry, cache: new PayloadCache() });
    const parent = createDomRoute('/users');
    parent.setAttribute('layout', 'users-shell');
    parent.setAttribute('view', 'url::ignored.html');

    await contentGraph.loadView(
      { href: '/users', pathname: '/users', search: '', hash: '', pattern: '/users', route: parent as never },
      new AbortController().signal,
    );
    expect(loads).toEqual(['users-shell']);
  });

  it('content route loads parsed view', async () => {
    const registry = new LoaderRegistry(undefined, []);
    const loads: string[] = [];
    registry.register('url', async (ctx) => {
      loads.push(ctx.ref);
      return ctx.ref;
    });

    const contentGraph = new ContentGraph({ registry, cache: new PayloadCache() });
    const route = createDomRoute('/users/:id');
    route.setAttribute('view', 'url::user.html');

    await contentGraph.loadView(
      withResolvedView({
        href: '/users/1',
        pathname: '/users/1',
        search: '',
        hash: '',
        pattern: '/users/:id',
        route: route as never,
        params: { id: '1' },
      }),
      new AbortController().signal,
    );
    expect(loads).toEqual(['user.html']);
  });

  it('returns null when content route has no view loader', async () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.register('html', async () => 'never');

    const contentGraph = new ContentGraph({ registry, cache: new PayloadCache() });
    const route = createDomRoute('/empty');

    const payload = await contentGraph.loadView(
      { href: '/empty', pathname: '/empty', search: '', hash: '', pattern: '/empty', route: route as never },
      new AbortController().signal,
    );

    expect(payload).toBeNull();
  });
});

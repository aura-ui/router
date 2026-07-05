/** @jest-environment jsdom */

import {
  AuraRoutingEngine,
  dataCacheKey,
  DataCache,
  ContentLoadService,
  LoaderRegistry,
} from '../../core';
import type { RouterInstance } from '../../core';
import { collectRoutesFromDom, createDomRoute } from '../helpers/test-route-dom';
import { withResolvedView } from '../helpers/with-resolved-view';

describe('content load flow (view → engine)', () => {
  const routerNav: RouterInstance = { navigate: jest.fn() };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolve reads view from upgraded aura-route', async () => {
    const registry = new LoaderRegistry();
    const loads: string[] = [];
    registry.register('html-src', async (ctx) => {
      loads.push(ctx.ref);
      return `<p>${ctx.ref}</p>`;
    });

    const contentLoad = new ContentLoadService({ registry, cache: new DataCache() });
    const route = createDomRoute('/feed');
    route.setAttribute('view', 'html-src::feed.html');

    await contentLoad.resolve(
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
    const registry = new LoaderRegistry();
    const loads: string[] = [];
    registry.register('html-src', async (ctx) => {
      loads.push(ctx.ref);
      return `<p>${ctx.ref}</p>`;
    });

    const contentLoad = new ContentLoadService({ registry, cache: new DataCache() });

    const about = createDomRoute('/about');
    about.setAttribute('view', 'html-src::about.html');

    const engine = new AuraRoutingEngine(routerNav, { contentLoad });
    engine.replaceRoutes(collectRoutesFromDom(about) as never);
    await engine.prefetch('/about');

    expect(loads).toEqual(['about.html']);
  });

  it('navigation render resolves via ContentLoadService.resolve', async () => {
    const registry = new LoaderRegistry();
    const loads: string[] = [];
    registry.register('html', async (ctx) => {
      loads.push(ctx.ref);
      return ctx.ref;
    });

    const contentLoad = new ContentLoadService({ registry, cache: new DataCache() });

    const route = createDomRoute('/x');
    route.setAttribute('view', 'html::<b>page</b>');

    await contentLoad.resolve(
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

  it('prefetch and navigation share dataCacheKey when preserve view is enabled', async () => {
    const registry = new LoaderRegistry();
    registry.register('html-src', async () => '<p>feed</p>');

    const cache = new DataCache();
    const contentLoad = new ContentLoadService({ registry, cache });
    const route = createDomRoute('/feed');
    route.setAttribute('view', 'html-src::feed.html');
    route.setAttribute('preserve', 'view');

    const routeInfo = withResolvedView({
      href: '/feed',
      pathname: '/feed',
      search: '',
      hash: '',
      pattern: '/feed',
      route,
    });

    await contentLoad.resolve(routeInfo, new AbortController().signal);
    expect(cache.get(dataCacheKey({
      kind: 'content',
      loader: 'html-src',
      ref: 'feed.html',
      cache: true,
    }, routeInfo))).toBeDefined();
  });

  it('layout route uses template loader from layout attr, not view', async () => {
    const registry = new LoaderRegistry();
    const loads: string[] = [];
    registry.register('template', async (ctx) => {
      loads.push(ctx.ref);
      return `<layout>${ctx.ref}</layout>`;
    });

    const contentLoad = new ContentLoadService({ registry, cache: new DataCache() });
    const parent = createDomRoute('/users');
    parent.setAttribute('layout', 'users-shell');
    parent.setAttribute('view', 'html-src::ignored.html');

    await contentLoad.resolve(
      { href: '/users', pathname: '/users', search: '', hash: '', pattern: '/users', route: parent as never },
      new AbortController().signal,
    );
    expect(loads).toEqual(['users-shell']);
  });

  it('content route loads parsed view', async () => {
    const registry = new LoaderRegistry();
    const loads: string[] = [];
    registry.register('html-src', async (ctx) => {
      loads.push(ctx.ref);
      return ctx.ref;
    });

    const contentLoad = new ContentLoadService({ registry, cache: new DataCache() });
    const route = createDomRoute('/users/:id');
    route.setAttribute('view', 'html-src::user.html');

    await contentLoad.resolve(
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
    const registry = new LoaderRegistry();
    registry.register('html', async () => 'never');

    const contentLoad = new ContentLoadService({ registry, cache: new DataCache() });
    const route = createDomRoute('/empty');

    const payload = await contentLoad.resolve(
      { href: '/empty', pathname: '/empty', search: '', hash: '', pattern: '/empty', route: route as never },
      new AbortController().signal,
    );

    expect(payload).toBeNull();
  });
});

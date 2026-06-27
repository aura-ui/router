/** @jest-environment jsdom */

import {
  AuraRoutingEngine,
  AuraRoutingProcessor,
  contentCacheKey,
  contentDescriptorFromRoute,
  ContentCache,
  ContentLoadService,
  ContentResolver,
  LoaderRegistry,
} from '../../core';
import { RouteContentLoader } from '../../../aura-route/core/route-content-loader';
import type { RouterInstance } from '../../../aura-route-hooks/core';
import { collectRoutesFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('content load flow (view → descriptor → engine)', () => {
  const routerNav: RouterInstance = { navigate: jest.fn() };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('contentDescriptorFromRoute reads view from upgraded aura-route', () => {
    const route = createDomRoute('/feed');
    route.setAttribute('view', 'html-src::feed.html');
    route.setAttribute('preserve', 'data');

    expect(contentDescriptorFromRoute(route)).toEqual({
      kind: 'content',
      loader: 'html-src',
      ref: 'feed.html',
      cache: true,
    });
  });

  it('prefetch loads via live route attrs', async () => {
    const registry = new LoaderRegistry();
    const loads: string[] = [];
    registry.register('html-src', async (ctx) => {
      loads.push(ctx.ref);
      return `<p>${ctx.ref}</p>`;
    });

    const contentLoad = new ContentLoadService({
      resolver: new ContentResolver({ registry, cache: new ContentCache() }),
    });

    const about = createDomRoute('/about');
    about.setAttribute('view', 'html-src::about.html');

    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), routerNav, { contentLoad });
    engine.replaceRoutes(collectRoutesFromDom(about) as never);
    await engine.prefetch('/about');

    expect(loads).toEqual(['about.html']);
  });

  it('navigation render uses contentDescriptorFromRoute via RouteContentLoader', async () => {
    const registry = new LoaderRegistry();
    const loads: string[] = [];
    registry.register('html', async (ctx) => {
      loads.push(ctx.ref);
      return ctx.ref;
    });

    const contentLoad = new ContentLoadService({
      resolver: new ContentResolver({ registry, cache: new ContentCache() }),
    });

    const route = createDomRoute('/x');
    route.setAttribute('view', 'html::<b>page</b>');

    const loader = new RouteContentLoader(route, contentLoad);
    await loader.resolve(
      { href: '/x', pathname: '/x', search: '', hash: '', pattern: '/x', route: route as never },
      new AbortController().signal,
    );

    expect(loads).toEqual(['<b>page</b>']);
    expect(contentDescriptorFromRoute(route)).toEqual({
      kind: 'content',
      loader: 'html',
      ref: '<b>page</b>',
      cache: false,
    });
  });

  it('prefetch and navigation share contentCacheKey when preserve data is enabled', () => {
    const route = createDomRoute('/feed');
    route.setAttribute('view', 'html-src::feed.html');
    route.setAttribute('preserve', 'data');

    const descriptor = contentDescriptorFromRoute(route);

    const routeInfo = {
      href: '/feed',
      pathname: '/feed',
      search: '',
      hash: '',
      pattern: '/feed',
      route,
    };

    expect(contentCacheKey(descriptor, routeInfo)).toBe('/feed|html-src:feed.html');
  });

  it('layout route uses template loader from layout attr, not view', () => {
    const child = createDomRoute(':id');
    child.setAttribute('view', 'html-src::user.html');
    const parent = createDomRoute('/users', [child]);
    parent.setAttribute('layout', 'users-shell');
    parent.setAttribute('view', 'html-src::ignored.html');

    expect(contentDescriptorFromRoute(parent)).toEqual({
      kind: 'layout',
      loader: 'template',
      ref: 'users-shell',
      cache: false,
    });
    expect(contentDescriptorFromRoute(child)).toEqual({
      kind: 'content',
      loader: 'html-src',
      ref: 'user.html',
      cache: false,
    });
  });
});

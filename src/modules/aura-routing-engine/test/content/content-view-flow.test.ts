/** @jest-environment jsdom */

import {
  AuraRoutingEngine,
  AuraRoutingProcessor,
  contentCacheKey,
  buildContentDescriptor,
  ContentCache,
  ContentLoadService,
  LoaderRegistry,
} from '../../core';
import type { RouterInstance } from '../../core';
import { collectRoutesFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('content load flow (view → descriptor → engine)', () => {
  const routerNav: RouterInstance = { navigate: jest.fn() };

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('buildContentDescriptor reads view from upgraded aura-route', () => {
    const route = createDomRoute('/feed');
    route.setAttribute('view', 'html-src::feed.html');
    route.setAttribute('preserve', 'data');

    expect(buildContentDescriptor(route)).toEqual({
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

    const contentLoad = new ContentLoadService({ registry, cache: new ContentCache() });

    const about = createDomRoute('/about');
    about.setAttribute('view', 'html-src::about.html');

    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), routerNav, { contentLoad });
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

    const contentLoad = new ContentLoadService({ registry, cache: new ContentCache() });

    const route = createDomRoute('/x');
    route.setAttribute('view', 'html::<b>page</b>');

    await contentLoad.resolve(
      { href: '/x', pathname: '/x', search: '', hash: '', pattern: '/x', route: route as never },
      new AbortController().signal,
    );

    expect(loads).toEqual(['<b>page</b>']);
    expect(buildContentDescriptor(route)).toEqual({
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

    const descriptor = buildContentDescriptor(route);

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

    expect(buildContentDescriptor(parent)).toEqual({
      kind: 'layout',
      loader: 'template',
      ref: 'users-shell',
      cache: false,
    });
    expect(buildContentDescriptor(child)).toEqual({
      kind: 'content',
      loader: 'html-src',
      ref: 'user.html',
      cache: false,
    });
  });
});

jest.mock('../../aura-router/core/aura-router', () => {
  const { AuraOutlet } = jest.requireActual('../../aura-outlet/core/aura-outlet');

  class MockAuraRouter extends HTMLElement {
    static is = 'aura-router';
    appOutlet = document.createElement(AuraOutlet.is);
    viewGraph = { loadView: jest.fn().mockResolvedValue({ data: '<span>ok</span>' }) };

    resolveViewPort() {
      return this.viewGraph;
    }
  }

  return { AuraRouter: MockAuraRouter };
});

import { AuraRouter } from '../../aura-router/core/aura-router';
import {
  AURA_ROUTE_LOADING_END,
  AURA_ROUTE_LOADING_START,
} from '../core/aura-route';
import {
  createMatchedRouteInfo,
  defineAuraOutlet,
  defineAuraRoute,
  defineAuraRouter,
  mountAuraRouteUnderRouter,
} from './_helpers';

type RouterHost = HTMLElement & { appOutlet: HTMLElement };

async function readyRoute(attrs: Record<string, string>, routerAttrs: Record<string, string> = {}) {
  const route = mountAuraRouteUnderRouter(attrs, routerAttrs);
  await customElements.whenDefined(AuraRouter.is);
  // One tick for AuraRoute.init after whenDefined.
  await Promise.resolve();
  return route;
}

function appendTemplate(id: string, html: string): void {
  const template = document.createElement('template');
  template.id = id;
  template.innerHTML = html;
  document.body.append(template);
}

function outletOf(route: HTMLElement) {
  return (route.closest(AuraRouter.is) as RouterHost).appOutlet as HTMLElement & {
    apply: (payload: string, opts?: { strategy?: string }) => unknown;
  };
}

describe('AuraRoute loading chrome', () => {
  beforeAll(() => {
    defineAuraOutlet();
    defineAuraRoute();
    defineAuraRouter(AuraRouter as CustomElementConstructor);
  });

  afterEach(() => {
    document.body.className = '';
    document.body.replaceChildren();
  });

  it('showLoading mounts template, toggles body class, and dispatches start event', async () => {
    appendTemplate('route-loading', '<p>Loading…</p>');

    const route = await readyRoute({
      path: '/slow',
      view: 'html::<span>done</span>',
      'loading-template': 'route-loading',
      'loading-body-class': 'is-loading',
    });

    const onStart = jest.fn();
    route.addEventListener(AURA_ROUTE_LOADING_START, onStart);

    const routeInfo = createMatchedRouteInfo('/slow');
    route.showLoading(routeInfo);

    expect(outletOf(route).textContent).toBe('Loading…');
    expect(document.body.classList.contains('is-loading')).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect((onStart.mock.calls[0]![0] as CustomEvent).detail).toEqual({ routeInfo });
  });

  it('showLoading is idempotent while loading is active', async () => {
    appendTemplate('route-loading', '<p>Loading…</p>');
    const route = await readyRoute({
      path: '/slow',
      view: 'html::<span>done</span>',
      'loading-template': 'route-loading',
    });
    const onStart = jest.fn();
    route.addEventListener(AURA_ROUTE_LOADING_START, onStart);

    route.showLoading(createMatchedRouteInfo('/slow'));
    route.showLoading(createMatchedRouteInfo('/slow'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(outletOf(route).textContent).toBe('Loading…');
  });

  it('hideLoading clears body class and dispatches end event', async () => {
    const route = await readyRoute({
      path: '/slow',
      view: 'html::<span>done</span>',
      'loading-body-class': 'is-loading',
    });

    const onEnd = jest.fn();
    route.addEventListener(AURA_ROUTE_LOADING_END, onEnd);

    route.showLoading(createMatchedRouteInfo('/slow'));
    route.hideLoading();

    expect(document.body.classList.contains('is-loading')).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('loading-start-event="none" skips start event', async () => {
    const route = await readyRoute({
      path: '/quiet',
      view: 'html::<span>done</span>',
      'loading-start-event': 'none',
      'loading-end-event': 'none',
    });

    const onStart = jest.fn();
    const onEnd = jest.fn();
    route.addEventListener(AURA_ROUTE_LOADING_START, onStart);
    route.addEventListener(AURA_ROUTE_LOADING_END, onEnd);

    route.showLoading(createMatchedRouteInfo('/quiet'));
    route.hideLoading();

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('warns when loading-template is missing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const route = await readyRoute({
      path: '/x',
      view: 'html::<span>done</span>',
      'loading-template': 'missing-loading',
    });

    route.showLoading(createMatchedRouteInfo('/x'));

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('inherits loading-template from aura-router and mounts it', async () => {
    appendTemplate('route-loading', '<p>Loading…</p>');
    const route = await readyRoute(
      { path: '/page', view: 'html::<span>done</span>' },
      { 'loading-template': 'route-loading' },
    );

    route.showLoading(createMatchedRouteInfo('/page'));

    expect(outletOf(route).textContent).toBe('Loading…');
  });

  it('loading-template="none" opts out of router default mount', async () => {
    appendTemplate('route-loading', '<p>Loading…</p>');
    const route = await readyRoute(
      {
        path: '/fast',
        view: 'html::<span>done</span>',
        'loading-template': 'none',
        'loading-body-class': 'is-loading',
      },
      { 'loading-template': 'route-loading' },
    );
    const outlet = outletOf(route);
    outlet.apply('<h1>Prev</h1>', { strategy: 'replace' });

    route.showLoading(createMatchedRouteInfo('/fast'));

    expect(outlet.children).toHaveLength(1);
    expect(outlet.textContent).toBe('Prev');
    expect(document.body.classList.contains('is-loading')).toBe(true);
  });

  it('layout route loading chrome does not warn about missing aura-outlet', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    appendTemplate('route-loading', '<p>Loading…</p>');

    const route = await readyRoute({
      path: '/users',
      layout: 'users-layout',
      'loading-template': 'route-loading',
    });

    route.showLoading(createMatchedRouteInfo('/users'));

    expect(outletOf(route).textContent).toBe('Loading…');
    expect(
      warn.mock.calls.some((args) => String(args[0]).includes('has no <aura-outlet>')),
    ).toBe(false);

    warn.mockRestore();
  });

  it('skips loading-template when route has a page transition', async () => {
    appendTemplate('route-loading', '<p>Loading…</p>');

    const route = await readyRoute({
      path: '/animated',
      view: 'html::<span>done</span>',
      'loading-template': 'route-loading',
      'loading-body-class': 'is-loading',
      'transition-order': 'parallel',
      'transition-in': 'fade',
      'transition-out': 'fade',
    });
    const outlet = outletOf(route);
    outlet.apply('<h1>Prev</h1>', { strategy: 'replace' });

    const onStart = jest.fn();
    route.addEventListener(AURA_ROUTE_LOADING_START, onStart);

    route.showLoading(createMatchedRouteInfo('/animated'));

    expect(outlet.children).toHaveLength(1);
    expect(outlet.textContent).toBe('Prev');
    expect(document.body.classList.contains('is-loading')).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('stages loading over committed view; cancel keeps About (About → Contacts → About)', async () => {
    appendTemplate('loading-contacts', '<h1>Loading contacts</h1>');

    const contacts = await readyRoute({
      path: '/contacts',
      view: 'html::<h1>Contacts</h1>',
      'loading-template': 'loading-contacts',
      'loading-body-class': 'is-loading',
    });
    const outlet = outletOf(contacts);

    outlet.apply('<h1>About</h1>', { strategy: 'replace' });
    expect(outlet.textContent).toBe('About');

    contacts.showLoading(createMatchedRouteInfo('/contacts'));

    expect(outlet.children).toHaveLength(2);
    expect((outlet.children[0] as HTMLElement).hidden).toBe(true);
    expect((outlet.children[0] as HTMLElement).textContent).toBe('About');
    expect(outlet.children[1]!.textContent).toBe('Loading contacts');
    expect(document.body.classList.contains('is-loading')).toBe(true);

    contacts.revertInFlightView();
    contacts.hideLoading();

    expect(outlet.children).toHaveLength(1);
    expect(outlet.textContent).toBe('About');
    expect((outlet.children[0] as HTMLElement).hidden).toBe(false);
    expect(document.body.classList.contains('is-loading')).toBe(false);
  });

  it('real mount after loading clears staged skeleton', async () => {
    appendTemplate('loading-then-view', '<p>Loading…</p>');

    const route = await readyRoute({
      path: '/page',
      view: 'html::<h1>Page</h1>',
      'loading-template': 'loading-then-view',
    });
    const outlet = outletOf(route);

    outlet.apply('<h1>Prev</h1>', { strategy: 'replace' });
    route.showLoading(createMatchedRouteInfo('/page'));
    expect(outlet.children).toHaveLength(2);

    const mounted = route.mountResolvedView(createMatchedRouteInfo('/page'), {
      preResolvedView: '<h1>Page</h1>',
    });

    expect(mounted).toEqual({ status: 'ok' });
    expect(outlet.children).toHaveLength(1);
    expect(outlet.textContent).toBe('Page');
  });

  it('real mount after loading is not skipped when cache=dom', async () => {
    appendTemplate('loading-cached', '<p>Loading…</p>');

    const route = await readyRoute({
      path: '/cached',
      view: 'html::<h1>Cached</h1>',
      'loading-template': 'loading-cached',
      cache: 'dom',
    });
    const outlet = outletOf(route);

    outlet.apply('<h1>Prev</h1>', { strategy: 'replace' });
    route.showLoading(createMatchedRouteInfo('/cached'));
    expect(outlet.children).toHaveLength(2);

    const mounted = route.mountResolvedView(createMatchedRouteInfo('/cached'), {
      preResolvedView: '<h1>Cached</h1>',
    });

    expect(mounted).toEqual({ status: 'ok' });
    expect(outlet.textContent).toBe('Cached');
  });
});

jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { AuraRoute } from '../core/aura-route';

describe('AuraRoute fast-path getters', () => {
  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function route(attrs: Record<string, string>, parent?: HTMLElement): AuraRoute {
    const el = document.createElement(AuraRoute.is) as AuraRoute;
    el.setAttribute('path', attrs.path ?? '/');
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'path') continue;
      el.setAttribute(name, value);
    }
    (parent ?? document.body).append(el);
    return el;
  }

  it('defaults to sync inline content', () => {
    const el = route({ view: 'html::<p>ok</p>' });
    expect(el.hasLayout).toBe(false);
    expect(el.hasGuard).toBe(false);
    expect(el.hasAsyncContent).toBe(false);
    expect(el.hasSyncContent).toBe(true);
  });

  it('hasSyncContent is false for fetch loaders and layout', () => {
    expect(route({ view: 'about.html' }).hasSyncContent).toBe(false);
    expect(route({ layout: 'shell', view: 'html::<p/>' }).hasSyncContent).toBe(false);
  });

  it('detects html-src default and explicit async loaders', () => {
    expect(route({ view: 'about.html' }).hasAsyncContent).toBe(true);
    expect(route({ view: 'html-src::about.html' }).hasAsyncContent).toBe(true);
    expect(route({ view: 'component-src::./x.js' }).hasAsyncContent).toBe(true);
  });

  it('detects phase attrs', () => {
    expect(route({ guard: 'auth', view: 'html::<p/>' }).hasGuard).toBe(true);
    expect(route({ leave: 'x', view: 'html::<p/>' }).hasLeave).toBe(true);
    expect(route({ load: 'data', view: 'html::<p/>' }).hasLoad).toBe(true);
    expect(route({ load: 'data', view: 'html::<p/>' }).hasAsyncContent).toBe(true);
    expect(route({ ready: 'analytics', view: 'html::<p/>' }).hasReady).toBe(true);
  });

  it('guard="" opts out of inherited guard', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('guard', 'auth');
    document.body.append(router);
    expect(route({ guard: '', view: 'html::<p/>' }, router).hasGuard).toBe(false);
  });

  it('layout is sync; transition shortcut sets in/out effects', () => {
    expect(route({ layout: 'shell' }).hasLayout).toBe(true);
    expect(route({ layout: 'shell' }).hasAsyncContent).toBe(false);

    const el = route({ view: 'html::<p/>', transition: 'fade' });
    expect(el.hasTransitionIn).toBe(true);
    expect(el.hasReady).toBe(true);
  });

  it('transition-order alone sets order without in/out effects', () => {
    const el = route({ view: 'html::<p/>', 'transition-order': 'parallel' });

    expect(el.transition).toEqual({ order: 'parallel', in: null, out: null });
    expect(el.hasTransitionIn).toBe(false);
    expect(el.hasReady).toBe(false);
  });
});

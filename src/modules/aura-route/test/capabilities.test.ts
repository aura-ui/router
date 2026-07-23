jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, mountAuraRoute } from './_helpers';

describe('AuraRoute fast-path getters', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('defaults to sync inline content', () => {
    const el = mountAuraRoute({ view: 'html::<p>ok</p>' });
    expect(el.hasLayout).toBe(false);
    expect(el.hasGuard).toBe(false);
    expect(el.hasAsyncContent).toBe(false);
    expect(el.hasSyncContent).toBe(true);
  });

  it('hasSyncContent is true for template and component loaders', () => {
    expect(mountAuraRoute({ view: 'template::about-page' }).hasSyncContent).toBe(true);
    expect(mountAuraRoute({ view: 'template::about-page' }).hasAsyncContent).toBe(false);
    expect(mountAuraRoute({ view: 'component::x-widget' }).hasSyncContent).toBe(true);
    expect(mountAuraRoute({ view: 'component::x-widget' }).hasAsyncContent).toBe(false);
  });

  it('hasSyncContent is false for async loaders, layout, and custom loaders', () => {
    expect(mountAuraRoute({ view: 'about.html' }).hasSyncContent).toBe(false);
    expect(mountAuraRoute({ layout: 'shell', view: 'html::<p/>' }).hasSyncContent).toBe(false);
    expect(mountAuraRoute({ view: 'markdown::doc.md' }).hasSyncContent).toBe(false);
    expect(mountAuraRoute({
      view: 'html::<p/>',
      'loading-template': 'loading',
    }).hasSyncContent).toBe(true);
  });

  it('detects url default and explicit async loaders', () => {
    expect(mountAuraRoute({ view: 'about.html' }).hasAsyncContent).toBe(true);
    expect(mountAuraRoute({ view: 'url::about.html' }).hasAsyncContent).toBe(true);
    expect(mountAuraRoute({ view: 'import::./x.js' }).hasAsyncContent).toBe(true);
    expect(mountAuraRoute({ view: 'iframe::https://example.com' }).hasAsyncContent).toBe(true);
  });

  it('detects phase attrs', () => {
    expect(mountAuraRoute({ guard: 'auth', view: 'html::<p/>' }).hasGuard).toBe(true);
    expect(mountAuraRoute({ leave: 'x', view: 'html::<p/>' }).hasLeave).toBe(true);
    expect(mountAuraRoute({ load: 'data', view: 'html::<p/>' }).hasLoad).toBe(true);
    expect(mountAuraRoute({ load: 'data', view: 'html::<p/>' }).hasAsyncContent).toBe(true);
    expect(mountAuraRoute({ ready: 'analytics', view: 'html::<p/>' }).hasReady).toBe(true);
  });

  it('guard="none" opts out of inherited guard', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('guard', 'auth');
    document.body.append(router);
    expect(mountAuraRoute({ guard: 'none', view: 'html::<p/>' }, { parent: router }).hasGuard).toBe(false);
  });

  it('layout is sync; transition shortcut sets in/out effects', () => {
    expect(mountAuraRoute({ layout: 'shell' }).hasLayout).toBe(true);
    expect(mountAuraRoute({ layout: 'shell' }).hasAsyncContent).toBe(false);

    const el = mountAuraRoute({ view: 'html::<p/>', transition: 'fade' });
    expect(el.hasTransitionIn).toBe(true);
    expect(el.hasReady).toBe(true);
  });

  it('transition-order alone sets order without in/out effects', () => {
    const el = mountAuraRoute({ view: 'html::<p/>', 'transition-order': 'parallel' });

    expect(el.transition).toEqual({ order: 'parallel', in: null, out: null });
    expect(el.hasTransitionIn).toBe(false);
    expect(el.hasReady).toBe(false);
  });
});

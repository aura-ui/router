import { ALL_CACHE, DEFAULT_CACHE, DOM_CACHE, NO_CACHE } from '../../aura-routing-engine/core';
import { createAuraRoute, defineAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute cache', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('parses cache attr', () => {
    expect(createAuraRoute({ path: '/a' }).cache).toEqual(NO_CACHE);
    expect(createAuraRoute({ path: '/a', cache: '' }).cache).toEqual(DEFAULT_CACHE);
    expect(createAuraRoute({ path: '/a', cache: 'dom' }).cache).toEqual(DOM_CACHE);
    expect(createAuraRoute({ path: '/a', cache: 'view' }).cache).toEqual({ dom: false, view: true, data: false });
    expect(createAuraRoute({ path: '/a', cache: 'data' }).cache).toEqual({ dom: false, view: false, data: true });
    expect(createAuraRoute({ path: '/a', cache: 'all' }).cache).toEqual(ALL_CACHE);
    expect(createAuraRoute({ path: '/a', cache: 'off' }).cache).toEqual(NO_CACHE);
    expect(createAuraRoute({ path: '/a', cache: 'none' }).cache).toEqual(NO_CACHE);
    expect(createAuraRoute({ path: '/a', cache: 'false' }).cache).toEqual(NO_CACHE);
  });

  it('exposes hasDomCache / hasViewCache / hasDataCache from cache flags', () => {
    const none = createAuraRoute({ path: '/a' });
    expect(none.hasDomCache).toBe(false);
    expect(none.hasViewCache).toBe(false);
    expect(none.hasDataCache).toBe(false);

    const defaults = createAuraRoute({ path: '/a', cache: '' });
    expect(defaults.hasDomCache).toBe(false);
    expect(defaults.hasViewCache).toBe(true);
    expect(defaults.hasDataCache).toBe(true);

    const dom = createAuraRoute({ path: '/a', cache: 'dom' });
    expect(dom.hasDomCache).toBe(true);
    expect(dom.hasViewCache).toBe(true);
    expect(dom.hasDataCache).toBe(false);

    const view = createAuraRoute({ path: '/a', cache: 'view' });
    expect(view.hasDomCache).toBe(false);
    expect(view.hasViewCache).toBe(true);
    expect(view.hasDataCache).toBe(false);

    const data = createAuraRoute({ path: '/a', cache: 'data' });
    expect(data.hasDomCache).toBe(false);
    expect(data.hasViewCache).toBe(false);
    expect(data.hasDataCache).toBe(true);

    const all = createAuraRoute({ path: '/a', cache: 'all' });
    expect(all.hasDomCache).toBe(true);
    expect(all.hasViewCache).toBe(true);
    expect(all.hasDataCache).toBe(true);
  });

  it('cache opt-out keywords break inherited cache', () => {
    for (const value of ['off', 'none', 'false']) {
      const child = mountAuraRouteUnderRouter({ path: '/child', cache: value }, { cache: 'dom' });
      expect(child.cache).toEqual(NO_CACHE);
    }
  });

  it('inherits cache from ancestor aura-router', () => {
    const child = mountAuraRouteUnderRouter({ path: '/child' }, { cache: 'data' });
    expect(child.cache).toEqual({ dom: false, view: false, data: true });
  });

  it('explicit cache on route overrides inherited value', () => {
    const child = mountAuraRouteUnderRouter({ path: '/child', cache: 'dom' }, { cache: 'data' });
    expect(child.cache).toEqual(DOM_CACHE);
  });
});

import { ALL_CACHE, DEFAULT_CACHE, DOM_CACHE, NO_CACHE } from '../../aura-routing-engine/core';
import { AuraRoute } from '../core/aura-route';

describe('AuraRoute cache', () => {
  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  function route(attrs: Record<string, string>): AuraRoute {
    const el = document.createElement(AuraRoute.is) as AuraRoute;
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, value);
    }
    return el;
  }

  it('parses cache attr', () => {
    expect(route({ path: '/a' }).cache).toEqual(NO_CACHE);
    expect(route({ path: '/a', cache: '' }).cache).toEqual(DEFAULT_CACHE);
    expect(route({ path: '/a', cache: 'dom' }).cache).toEqual(DOM_CACHE);
    expect(route({ path: '/a', cache: 'view' }).cache).toEqual({ dom: false, view: true, data: false });
    expect(route({ path: '/a', cache: 'data' }).cache).toEqual({ dom: false, view: false, data: true });
    expect(route({ path: '/a', cache: 'all' }).cache).toEqual(ALL_CACHE);
    expect(route({ path: '/a', cache: 'off' }).cache).toEqual(NO_CACHE);
    expect(route({ path: '/a', cache: 'none' }).cache).toEqual(NO_CACHE);
    expect(route({ path: '/a', cache: 'false' }).cache).toEqual(NO_CACHE);
  });

  it('exposes hasDomCache / hasViewCache / hasDataCache from cache flags', () => {
    const none = route({ path: '/a' });
    expect(none.hasDomCache).toBe(false);
    expect(none.hasViewCache).toBe(false);
    expect(none.hasDataCache).toBe(false);

    const defaults = route({ path: '/a', cache: '' });
    expect(defaults.hasDomCache).toBe(false);
    expect(defaults.hasViewCache).toBe(true);
    expect(defaults.hasDataCache).toBe(true);

    const dom = route({ path: '/a', cache: 'dom' });
    expect(dom.hasDomCache).toBe(true);
    expect(dom.hasViewCache).toBe(true);
    expect(dom.hasDataCache).toBe(false);

    const view = route({ path: '/a', cache: 'view' });
    expect(view.hasDomCache).toBe(false);
    expect(view.hasViewCache).toBe(true);
    expect(view.hasDataCache).toBe(false);

    const data = route({ path: '/a', cache: 'data' });
    expect(data.hasDomCache).toBe(false);
    expect(data.hasViewCache).toBe(false);
    expect(data.hasDataCache).toBe(true);

    const all = route({ path: '/a', cache: 'all' });
    expect(all.hasDomCache).toBe(true);
    expect(all.hasViewCache).toBe(true);
    expect(all.hasDataCache).toBe(true);
  });

  it('cache opt-out keywords break inherited cache', () => {
    for (const value of ['off', 'none', 'false']) {
      document.body.innerHTML = `
        <aura-router cache="dom">
          <aura-route path="/child" cache="${value}"></aura-route>
        </aura-router>
      `;
      const child = document.querySelector(AuraRoute.is) as AuraRoute;
      expect(child.cache).toEqual(NO_CACHE);
      document.body.replaceChildren();
    }
  });

  it('inherits cache from ancestor aura-router', () => {
    document.body.innerHTML = `
      <aura-router cache="data">
        <aura-route path="/child"></aura-route>
      </aura-router>
    `;
    const child = document.querySelector(AuraRoute.is) as AuraRoute;
    expect(child.cache).toEqual({ dom: false, view: false, data: true });
    document.body.replaceChildren();
  });

  it('explicit cache on route overrides inherited value', () => {
    document.body.innerHTML = `
      <aura-router cache="data">
        <aura-route path="/child" cache="dom"></aura-route>
      </aura-router>
    `;
    const child = document.querySelector(AuraRoute.is) as AuraRoute;
    expect(child.cache).toEqual(DOM_CACHE);
    document.body.replaceChildren();
  });
});

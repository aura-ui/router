import { AuraRoute } from '../core/aura-route';
import { NO_CACHE } from '../../aura-routing-engine/core';

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
    expect(route({ path: '/a', cache: '' }).cache).toEqual(NO_CACHE);
    expect(route({ path: '/a', cache: 'dom' }).cache).toEqual({ dom: true, view: false, data: false });
    expect(route({ path: '/a', cache: 'view' }).cache).toEqual({ dom: false, view: true, data: false });
    expect(route({ path: '/a', cache: 'data' }).cache).toEqual({ dom: false, view: false, data: true });
    expect(route({ path: '/a', cache: 'screen' }).cache).toEqual({ dom: true, view: true, data: false });
    expect(route({ path: '/a', cache: 'all' }).cache).toEqual({ dom: true, view: true, data: true });
    expect(route({ path: '/a', cache: 'off' }).cache).toEqual(NO_CACHE);
    expect(route({ path: '/a', cache: 'none' }).cache).toEqual(NO_CACHE);
    expect(route({ path: '/a', cache: 'false' }).cache).toEqual(NO_CACHE);
  });

  it('cache opt-out keywords break inherited cache', () => {
    for (const value of ['off', 'none', 'false']) {
      document.body.innerHTML = `
        <aura-router cache="screen">
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
        <aura-route path="/child" cache="screen"></aura-route>
      </aura-router>
    `;
    const child = document.querySelector(AuraRoute.is) as AuraRoute;
    expect(child.cache).toEqual({ dom: true, view: true, data: false });
    document.body.replaceChildren();
  });
});

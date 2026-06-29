import { AuraRoute } from '../core/aura-route';
import { NO_PRESERVE } from '../../aura-routing-engine/core';

describe('AuraRoute preserve', () => {
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

  it('parses preserve attr', () => {
    expect(route({ path: '/a' }).preserve).toEqual(NO_PRESERVE);
    expect(route({ path: '/a', preserve: '' }).preserve).toEqual({ view: true, data: false });
    expect(route({ path: '/a', preserve: 'view' }).preserve).toEqual({ view: true, data: false });
    expect(route({ path: '/a', preserve: 'data' }).preserve).toEqual({ view: false, data: true });
    expect(route({ path: '/a', preserve: 'all' }).preserve).toEqual({ view: true, data: true });
  });

  it('inherits preserve from ancestor aura-router', () => {
    document.body.innerHTML = `
      <aura-router preserve="data">
        <aura-route path="/child"></aura-route>
      </aura-router>
    `;
    const child = document.querySelector(AuraRoute.is) as AuraRoute;
    expect(child.preserve).toEqual({ view: false, data: true });
    document.body.replaceChildren();
  });

  it('explicit preserve on route overrides inherited value', () => {
    document.body.innerHTML = `
      <aura-router preserve="data">
        <aura-route path="/child" preserve=""></aura-route>
      </aura-router>
    `;
    const child = document.querySelector(AuraRoute.is) as AuraRoute;
    expect(child.preserve).toEqual({ view: true, data: false });
    document.body.replaceChildren();
  });
});

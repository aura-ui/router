jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { AuraRoute } from '../core/aura-route';

describe('AuraRoute prefetch inherit', () => {
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
    parent?.append(el);
    return el;
  }

  it('inherits prefetch from aura-router', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('prefetch', 'tap');
    const child = route({ path: '/feed' }, router);

    expect(child.prefetch).toBe('tap');
  });

  it('child overrides inherited prefetch', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('prefetch', 'intent');
    const child = route({ path: '/checkout', prefetch: 'false' }, router);

    expect(child.prefetch).toBe(false);
  });

  it('prefetch="none" disables inherited prefetch', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('prefetch', 'tap');
    const child = route({ path: '/quiet', prefetch: 'none' }, router);

    expect(child.prefetch).toBe(false);
  });

  it('returns null when no prefetch on route or ancestors', () => {
    const router = document.createElement('aura-router');
    const child = route({ path: '/open' }, router);

    expect(child.prefetch).toBeNull();
  });
});

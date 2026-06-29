jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { AuraRoute } from '../core/aura-route';

describe('AuraRoute lifecycle inherit', () => {
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

  it('inherits enter and after from aura-router', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('enter', 'auth');
    router.setAttribute('after', 'analytics');
    const child = route({ path: '/app' }, router);

    expect(child.enter).toEqual(['auth']);
    expect(child.afterHook).toEqual(['analytics']);
  });

  it('enter="" opts out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('enter', 'auth');
    const child = route({ path: '/login', enter: '' }, router);

    expect(child.enter).toEqual([]);
  });

  it('after="" opts out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('after', 'analytics');
    const child = route({ path: '/quiet', after: '' }, router);

    expect(child.afterHook).toEqual([]);
  });

  it('child overrides inherited enter', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('enter', 'auth');
    const child = route({ path: '/admin', enter: 'admin-only' }, router);

    expect(child.enter).toEqual(['admin-only']);
  });

  it('nested route inherits from parent route when router has no attr', () => {
    const router = document.createElement('aura-router');
    const parent = route({ path: '/users', enter: 'admin' }, router);
    const child = route({ path: ':id' }, parent);

    expect(child.enter).toEqual(['admin']);
  });

  it('nested child overrides parent enter', () => {
    const router = document.createElement('aura-router');
    const parent = route({ path: '/users', enter: 'admin' }, router);
    const child = route({ path: 'public', enter: '' }, parent);

    expect(child.enter).toEqual([]);
  });

  it('parent route wins over router for nested child', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('enter', 'auth');
    const parent = route({ path: '/users', enter: 'admin' }, router);
    const child = route({ path: ':id' }, parent);

    expect(child.enter).toEqual(['admin']);
  });

  it('returns null when no enter on route or ancestors', () => {
    const router = document.createElement('aura-router');
    const child = route({ path: '/open' }, router);

    expect(child.enter).toBeNull();
    expect(child.afterHook).toBeNull();
  });
});

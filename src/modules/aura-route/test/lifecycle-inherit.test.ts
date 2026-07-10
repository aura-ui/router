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

  it('inherits guard and ready from aura-router', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('guard', 'auth');
    router.setAttribute('ready', 'analytics');
    const child = route({ path: '/app' }, router);

    expect(child.guard).toEqual(['auth']);
    expect(child.ready).toEqual(['analytics']);
  });

  it('guard="none" opts out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('guard', 'auth');
    const child = route({ path: '/login', guard: 'none' }, router);

    expect(child.guard).toEqual([]);
  });

  it('ready="off" opts out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('ready', 'analytics');
    const child = route({ path: '/quiet', ready: 'off' }, router);

    expect(child.ready).toEqual([]);
  });

  it('child overrides inherited guard', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('guard', 'auth');
    const child = route({ path: '/admin', guard: 'admin-only' }, router);

    expect(child.guard).toEqual(['admin-only']);
  });

  it('nested route inherits from parent route when router has no attr', () => {
    const router = document.createElement('aura-router');
    const parent = route({ path: '/users', guard: 'admin' }, router);
    const child = route({ path: ':id' }, parent);

    expect(child.guard).toEqual(['admin']);
  });

  it('nested child overrides parent guard', () => {
    const router = document.createElement('aura-router');
    const parent = route({ path: '/users', guard: 'admin' }, router);
    const child = route({ path: 'public', guard: 'false' }, parent);

    expect(child.guard).toEqual([]);
  });

  it('parent route wins over router for nested child', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('guard', 'auth');
    const parent = route({ path: '/users', guard: 'admin' }, router);
    const child = route({ path: ':id' }, parent);

    expect(child.guard).toEqual(['admin']);
  });

  it('returns null when no guard on route or ancestors', () => {
    const router = document.createElement('aura-router');
    const child = route({ path: '/open' }, router);

    expect(child.guard).toBeNull();
    expect(child.ready).toBeNull();
  });
});

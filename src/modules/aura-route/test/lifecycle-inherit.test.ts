jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, mountAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute lifecycle inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits guard and ready from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/app' },
      { guard: 'auth', ready: 'analytics' },
    );

    expect(child.guard).toEqual(['auth']);
    expect(child.ready).toEqual(['analytics']);
  });

  it('guard="none" opts out of router default', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/login', guard: 'none' },
      { guard: 'auth' },
    );

    expect(child.guard).toEqual([]);
  });

  it('ready="off" opts out of router default', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/quiet', ready: 'off' },
      { ready: 'analytics' },
    );

    expect(child.ready).toEqual([]);
  });

  it('child overrides inherited guard', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/admin', guard: 'admin-only' },
      { guard: 'auth' },
    );

    expect(child.guard).toEqual(['admin-only']);
  });

  it('nested route inherits from parent route when router has no attr', () => {
    const parent = mountAuraRouteUnderRouter({ path: '/users', guard: 'admin' });
    const child = mountAuraRoute({ path: ':id' }, { parent });

    expect(child.guard).toEqual(['admin']);
  });

  it('nested child overrides parent guard', () => {
    const parent = mountAuraRouteUnderRouter({ path: '/users', guard: 'admin' });
    const child = mountAuraRoute({ path: 'public', guard: 'false' }, { parent });

    expect(child.guard).toEqual([]);
  });

  it('parent route wins over router for nested child', () => {
    const parent = mountAuraRouteUnderRouter(
      { path: '/users', guard: 'admin' },
      { guard: 'auth' },
    );
    const child = mountAuraRoute({ path: ':id' }, { parent });

    expect(child.guard).toEqual(['admin']);
  });

  it('returns null when no guard on route or ancestors', () => {
    const child = mountAuraRouteUnderRouter({ path: '/open' });

    expect(child.guard).toBeNull();
    expect(child.ready).toBeNull();
  });
});

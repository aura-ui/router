jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute scroll inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits scroll from aura-router', () => {
    const child = mountAuraRouteUnderRouter({ path: '/feed' }, { scroll: 'restore' });

    expect(child.scrollPolicy).toBe('restore');
  });

  it('scroll="none" opts out of router default', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/checkout', scroll: 'none' },
      { scroll: 'restore' },
    );

    expect(child.scrollPolicy).toBe('manual');
  });

  it('child overrides inherited scroll', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/checkout', scroll: 'top' },
      { scroll: 'restore' },
    );

    expect(child.scrollPolicy).toBe('top');
  });

  it('returns null when no scroll on route or ancestors', () => {
    const child = mountAuraRouteUnderRouter({ path: '/open' });

    expect(child.scrollPolicy).toBeNull();
  });
});

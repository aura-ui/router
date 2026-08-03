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
    const child = mountAuraRouteUnderRouter({ path: '/feed' }, { scroll: 'auto' });

    expect(child.scrollPolicy).toBe('auto');
  });

  it('scroll="none" opts out of router default', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/checkout', scroll: 'none' },
      { scroll: 'auto' },
    );

    expect(child.scrollPolicy).toBe('none');
  });

  it('child overrides inherited scroll', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/checkout', scroll: 'top' },
      { scroll: 'auto' },
    );

    expect(child.scrollPolicy).toBe('top');
  });

  it('defaults to auto when no scroll on route or ancestors', () => {
    const child = mountAuraRouteUnderRouter({ path: '/open' });

    expect(child.scrollPolicy).toBe('auto');
  });
});

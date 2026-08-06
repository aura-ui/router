jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute scroll-behavior inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits scroll-behavior from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/feed' },
      { 'scroll-behavior': 'smooth' },
    );

    expect(child.scrollBehavior).toBe('smooth');
  });

  it('child overrides inherited scroll-behavior', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/checkout', 'scroll-behavior': 'instant' },
      { 'scroll-behavior': 'smooth' },
    );

    expect(child.scrollBehavior).toBe('instant');
  });

  it('defaults to auto when unset on route or ancestors', () => {
    const child = mountAuraRouteUnderRouter({ path: '/open' });

    expect(child.scrollBehavior).toBe('auto');
  });
});

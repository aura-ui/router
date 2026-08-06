jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute scroll-target inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits scroll-target from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/docs' },
      { 'scroll-target': '#main' },
    );

    expect(child.scrollTarget).toBe('#main');
  });

  it('scroll-target="none" opts out of router default', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/checkout', 'scroll-target': 'none' },
      { 'scroll-target': '#main' },
    );

    expect(child.scrollTarget).toBeNull();
  });

  it('child overrides inherited scroll-target', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/docs', 'scroll-target': '#content' },
      { 'scroll-target': '#main' },
    );

    expect(child.scrollTarget).toBe('#content');
  });

  it('defaults to null when unset on route or ancestors', () => {
    const child = mountAuraRouteUnderRouter({ path: '/open' });

    expect(child.scrollTarget).toBeNull();
  });
});

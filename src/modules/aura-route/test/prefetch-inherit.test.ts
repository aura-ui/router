jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute prefetch inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits prefetch from aura-router', () => {
    const child = mountAuraRouteUnderRouter({ path: '/feed' }, { prefetch: 'tap' });

    expect(child.prefetch).toBe('tap');
  });

  it('child overrides inherited prefetch', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/checkout', prefetch: 'false' },
      { prefetch: 'intent' },
    );

    expect(child.prefetch).toBe(false);
  });

  it('prefetch="none" disables inherited prefetch', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/quiet', prefetch: 'none' },
      { prefetch: 'tap' },
    );

    expect(child.prefetch).toBe(false);
  });

  it('returns null when no prefetch on route or ancestors', () => {
    const child = mountAuraRouteUnderRouter({ path: '/open' });

    expect(child.prefetch).toBeNull();
  });
});

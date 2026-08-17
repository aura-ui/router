jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute meta inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits meta-title from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/feed' },
      { 'meta-title': 'App' },
    );

    expect(child.metaTitle).toBe('App');
  });

  it('child overrides inherited meta-title', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/about', 'meta-title': 'About' },
      { 'meta-title': 'App' },
    );

    expect(child.metaTitle).toBe('About');
  });

  it('meta-title="none" opts out of inherited title', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/bare', 'meta-title': 'none' },
      { 'meta-title': 'App' },
    );

    expect(child.metaTitle).toBeNull();
  });

  it('inherits meta-title-template from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/feed' },
      { 'meta-title-template': '%s | App' },
    );

    expect(child.metaTitleTemplate).toBe('%s | App');
  });

  it('child meta-title does not replace inherited template', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/about', 'meta-title': 'About' },
      { 'meta-title-template': '%s | App' },
    );

    expect(child.metaTitle).toBe('About');
    expect(child.metaTitleTemplate).toBe('%s | App');
  });

  it('meta-title-template="none" opts out of inherited wrap', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/landing', 'meta-title-template': 'none' },
      { 'meta-title-template': '%s | App' },
    );

    expect(child.metaTitleTemplate).toBeNull();
  });
});

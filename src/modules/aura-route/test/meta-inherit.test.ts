jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, createAuraRoute, mountAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute meta inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('does not inherit meta-title from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/feed' },
      { 'meta-title': 'App' },
    );

    expect(child.metaTitle).toBeNull();
  });

  it('does not inherit meta-description or meta-canonical from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/feed' },
      { 'meta-description': 'Site', 'meta-canonical': 'https://example.com' },
    );

    expect(child.metaDescription).toBeNull();
    expect(child.metaCanonical).toBeNull();
  });

  it('inherits meta-title from parent aura-route', () => {
    const parent = createAuraRoute({ path: '/app', 'meta-title': 'App' });
    const child = mountAuraRoute({ path: '/app/feed' }, { parent });

    expect(child.metaTitle).toBe('App');
  });

  it('inherits meta-description and meta-canonical from parent aura-route', () => {
    const parent = createAuraRoute({
      path: '/app',
      'meta-description': 'Section',
      'meta-canonical': 'https://example.com/app',
    });
    const child = mountAuraRoute({ path: '/app/feed' }, { parent });

    expect(child.metaDescription).toBe('Section');
    expect(child.metaCanonical).toBe('https://example.com/app');
  });

  it('child overrides inherited meta-title', () => {
    const parent = createAuraRoute({ path: '/app', 'meta-title': 'App' });
    const child = mountAuraRoute({ path: '/about', 'meta-title': 'About' }, { parent });

    expect(child.metaTitle).toBe('About');
  });

  it('meta-title="none" opts out of inherited title', () => {
    const parent = createAuraRoute({ path: '/app', 'meta-title': 'App' });
    const child = mountAuraRoute({ path: '/bare', 'meta-title': 'none' }, { parent });

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

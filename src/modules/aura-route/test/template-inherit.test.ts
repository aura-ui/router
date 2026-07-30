jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { defineAuraRoute, mountAuraRoute, mountAuraRouteUnderRouter } from './_helpers';

describe('AuraRoute template inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits loading-template and error-template from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/app' },
      { 'loading-template': 'loading', 'error-template': 'error' },
    );

    expect(child.loadingTemplate).toBe('loading');
    expect(child.errorTemplate).toBe('error');
  });

  it('inherits loading-body-class and loading events from aura-router', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/app' },
      {
        'loading-body-class': 'is-loading',
        'loading-start-event': 'app-loading',
        'loading-end-event': 'app-loaded',
      },
    );

    expect(child.loadingBodyClass).toBe('is-loading');
    expect(child.loadingStartEvent).toBe('app-loading');
    expect(child.loadingEndEvent).toBe('app-loaded');
  });

  it('uses default loading event names when unset', () => {
    const child = mountAuraRouteUnderRouter({ path: '/app' });

    expect(child.loadingStartEvent).toBe('aura-route-loading');
    expect(child.loadingEndEvent).toBe('aura-route-loading-end');
    expect(child.loadingBodyClass).toBeNull();
  });

  it('loading-template="none" opts out of router default', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/fast', 'loading-template': 'none' },
      { 'loading-template': 'loading' },
    );

    expect(child.loadingTemplate).toBeNull();
  });

  it('loading-start-event="none" opts out of default event', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/quiet', 'loading-start-event': 'none', 'loading-end-event': 'off' },
    );

    expect(child.loadingStartEvent).toBeNull();
    expect(child.loadingEndEvent).toBeNull();
  });

  it('error-template="off" opts out of router default', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/quiet', 'error-template': 'off' },
      { 'error-template': 'error' },
    );

    expect(child.errorTemplate).toBeNull();
  });

  it('child overrides inherited templates', () => {
    const child = mountAuraRouteUnderRouter(
      {
        path: '/editor',
        'loading-template': 'editor-skeleton',
        'error-template': 'editor-error',
      },
      { 'loading-template': 'loading', 'error-template': 'error' },
    );

    expect(child.loadingTemplate).toBe('editor-skeleton');
    expect(child.errorTemplate).toBe('editor-error');
  });

  it('nested route inherits from parent route', () => {
    const parent = mountAuraRouteUnderRouter(
      { path: '/users', 'error-template': 'users-error' },
    );
    const child = mountAuraRoute({ path: ':id' }, { parent });

    expect(child.errorTemplate).toBe('users-error');
  });
});

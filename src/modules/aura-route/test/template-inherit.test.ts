jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { AuraRoute } from '../core/aura-route';

describe('AuraRoute template inherit', () => {
  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
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

  it('inherits loading-template and error-template from aura-router', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('loading-template', 'loading');
    router.setAttribute('error-template', 'error');
    const child = route({ path: '/app' }, router);

    expect(child.loadingTemplate).toBe('loading');
    expect(child.errorTemplate).toBe('error');
  });

  it('loading-template="" opts out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('loading-template', 'loading');
    const child = route({ path: '/fast', 'loading-template': '' }, router);

    expect(child.loadingTemplate).toBe('');
  });

  it('error-template="" opts out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('error-template', 'error');
    const child = route({ path: '/quiet', 'error-template': '' }, router);

    expect(child.errorTemplate).toBe('');
  });

  it('child overrides inherited templates', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('loading-template', 'loading');
    router.setAttribute('error-template', 'error');
    const child = route({
      path: '/editor',
      'loading-template': 'editor-skeleton',
      'error-template': 'editor-error',
    }, router);

    expect(child.loadingTemplate).toBe('editor-skeleton');
    expect(child.errorTemplate).toBe('editor-error');
  });

  it('nested route inherits from parent route', () => {
    const router = document.createElement('aura-router');
    const parent = route({ path: '/users', 'error-template': 'users-error' }, router);
    const child = route({ path: ':id' }, parent);

    expect(child.errorTemplate).toBe('users-error');
  });
});

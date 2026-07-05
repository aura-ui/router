jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { AuraRoute } from '../core/aura-route';

describe('AuraRoute scroll inherit', () => {
  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
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

  it('inherits scroll from aura-router', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('scroll', 'restore');
    const child = route({ path: '/feed' }, router);

    expect(child.scrollPolicy).toBe('restore');
  });

  it('scroll="" opts out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('scroll', 'restore');
    const child = route({ path: '/checkout', scroll: '' }, router);

    expect(child.scrollPolicy).toBe('manual');
  });

  it('child overrides inherited scroll', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('scroll', 'restore');
    const child = route({ path: '/checkout', scroll: 'top' }, router);

    expect(child.scrollPolicy).toBe('top');
  });

  it('returns null when no scroll on route or ancestors', () => {
    const router = document.createElement('aura-router');
    const child = route({ path: '/open' }, router);

    expect(child.scrollPolicy).toBeNull();
  });
});

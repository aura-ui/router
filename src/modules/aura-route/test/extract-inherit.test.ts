jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import { AuraRoute } from '../core/aura-route';

describe('AuraRoute extract inherit', () => {
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

  it('inherits extract from aura-router', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('extract', '#main');
    const child = route({ path: '/about' }, router);

    expect(child.extract).toBe('#main');
  });

  it('inherits null when aura-router extract is an off keyword', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('extract', 'none');
    const child = route({ path: '/about' }, router);

    expect(child.extract).toBeNull();
  });

  it('extract="none" opts out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('extract', '#main');
    const child = route({ path: '/partial', extract: 'none' }, router);

    expect(child.extract).toBeNull();
  });

  it('extract="off" / "false" / "" opt out of router default', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('extract', '#main');

    expect(route({ path: '/a', extract: 'off' }, router).extract).toBeNull();
    expect(route({ path: '/b', extract: 'false' }, router).extract).toBeNull();
    expect(route({ path: '/c', extract: '' }, router).extract).toBeNull();
  });

  it('extract="none" opts out of parent route', () => {
    const parent = route({ path: '/legacy', extract: '#main' });
    const child = route({ path: '/legacy/partial', extract: 'none' }, parent);

    expect(child.extract).toBeNull();
  });

  it('child overrides inherited extract', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('extract', '#main');
    const child = route({ path: '/article', extract: '#content' }, router);

    expect(child.extract).toBe('#content');
  });

  it('inherits from parent aura-route', () => {
    const parent = route({ path: '/legacy', extract: '#main' });
    const child = route({ path: '/legacy/about' }, parent);

    expect(child.extract).toBe('#main');
  });

  it('removing local extract restores ancestor inherit', () => {
    const router = document.createElement('aura-router');
    router.setAttribute('extract', '#main');
    const child = route({ path: '/partial', extract: 'none' }, router);

    expect(child.extract).toBeNull();
    child.removeAttribute('extract');
    expect(child.extract).toBe('#main');
  });

  it('returns null when no extract on route or ancestors', () => {
    const router = document.createElement('aura-router');
    const child = route({ path: '/open' }, router);

    expect(child.extract).toBeNull();
  });
});

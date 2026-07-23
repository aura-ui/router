jest.mock('../../aura-router/core/aura-router', () => ({
  AuraRouter: class {
    static is = 'aura-router';
  },
}));

import {
  createAuraRoute,
  defineAuraRoute,
  mountAuraRoute,
  mountAuraRouteUnderRouter,
} from './_helpers';

describe('AuraRoute extract inherit', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits extract from aura-router', () => {
    const child = mountAuraRouteUnderRouter({ path: '/about' }, { extract: '#main' });

    expect(child.extract).toBe('#main');
  });

  it('inherits null when aura-router extract is an off keyword', () => {
    const child = mountAuraRouteUnderRouter({ path: '/about' }, { extract: 'none' });

    expect(child.extract).toBeNull();
  });

  it('extract="none" opts out of router default', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/partial', extract: 'none' },
      { extract: '#main' },
    );

    expect(child.extract).toBeNull();
  });

  it('extract="off" / "false" / "" opt out of router default', () => {
    expect(mountAuraRouteUnderRouter({ path: '/a', extract: 'off' }, { extract: '#main' }).extract)
      .toBeNull();
    expect(mountAuraRouteUnderRouter({ path: '/b', extract: 'false' }, { extract: '#main' }).extract)
      .toBeNull();
    expect(mountAuraRouteUnderRouter({ path: '/c', extract: '' }, { extract: '#main' }).extract)
      .toBeNull();
  });

  it('extract="none" opts out of parent route', () => {
    const parent = createAuraRoute({ path: '/legacy', extract: '#main' });
    const child = mountAuraRoute(
      { path: '/legacy/partial', extract: 'none' },
      { parent },
    );

    expect(child.extract).toBeNull();
  });

  it('child overrides inherited extract', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/article', extract: '#content' },
      { extract: '#main' },
    );

    expect(child.extract).toBe('#content');
  });

  it('inherits from parent aura-route', () => {
    const parent = createAuraRoute({ path: '/legacy', extract: '#main' });
    const child = mountAuraRoute({ path: '/legacy/about' }, { parent });

    expect(child.extract).toBe('#main');
  });

  it('removing local extract restores ancestor inherit', () => {
    const child = mountAuraRouteUnderRouter(
      { path: '/partial', extract: 'none' },
      { extract: '#main' },
    );

    expect(child.extract).toBeNull();
    child.removeAttribute('extract');
    expect(child.extract).toBe('#main');
  });

  it('returns null when no extract on route or ancestors', () => {
    const child = mountAuraRouteUnderRouter({ path: '/open' });

    expect(child.extract).toBeNull();
  });
});

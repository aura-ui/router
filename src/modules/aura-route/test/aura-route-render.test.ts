jest.mock('../../aura-router/core/aura-router', () => {
  const { AuraOutlet } = jest.requireActual('../../aura-outlet/core/aura-outlet');

  class MockAuraRouter extends HTMLElement {
    static is = 'aura-router';
    appOutlet = document.createElement(AuraOutlet.is);
    viewGraph = { loadView: jest.fn().mockResolvedValue({ payload: '<span>ok</span>' }) };

    resolveViewPort() {
      return this.viewGraph;
    }
  }

  return { AuraRouter: MockAuraRouter };
});

import { AuraRouter } from '../../aura-router/core/aura-router';
import {
  createMatchedRouteInfo,
  defineAuraOutlet,
  defineAuraRoute,
  defineAuraRouter,
  mountAuraRouteUnderRouter,
} from './_helpers';

describe('AuraRoute render validation', () => {
  beforeAll(() => {
    defineAuraOutlet();
    defineAuraRoute();
    defineAuraRouter(AuraRouter as CustomElementConstructor);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('throws on render when page has no view', async () => {
    const route = mountAuraRouteUnderRouter({ path: '/empty' });

    await expect(route.resolveAndMountView(createMatchedRouteInfo('/empty')))
      .rejects.toThrow('AuraRoute page "/empty" has no view');
  });

  it('allows path-group folder without layout on render', async () => {
    const route = mountAuraRouteUnderRouter(
      { path: '/settings' },
      {},
      { innerHTML: '<aura-route path="profile" view="html::<p/>"></aura-route>' },
    );

    await expect(route.resolveAndMountView(createMatchedRouteInfo('/settings'))).resolves.toEqual({
      status: 'ok',
    });
  });

  it('throws when folder declares view and children', async () => {
    const route = mountAuraRouteUnderRouter(
      { path: '/settings', layout: 'shell', view: 'html::<p/>' },
      {},
      { innerHTML: '<aura-route path="profile" view="html::<p/>"></aura-route>' },
    );

    await expect(route.resolveAndMountView(createMatchedRouteInfo('/settings')))
      .rejects.toThrow('cannot declare view');
  });
});

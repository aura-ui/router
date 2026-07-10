jest.mock('../../aura-router/core/aura-router', () => {
  const { AuraOutlet } = require('../../aura-outlet/core/aura-outlet');
  return {
    AuraRouter: class {
      static is = 'aura-router';
      appOutlet = document.createElement(AuraOutlet.is);
      viewGraph = { loadView: jest.fn().mockResolvedValue('<span>ok</span>') };
    },
  };
});

import { AuraRoute } from '../core/aura-route';
import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';

describe('AuraRoute render validation', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
    if (!customElements.get('aura-router')) {
      customElements.define('aura-router', class extends HTMLElement {});
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function mountRoute(
    attrs: Record<string, string>,
    innerHTML = '',
  ): AuraRoute {
    const router = document.createElement('aura-router');
    const route = document.createElement(AuraRoute.is) as AuraRoute;
    route.setAttribute('path', attrs.path ?? '/page');
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'path') continue;
      route.setAttribute(name, value);
    }
    route.innerHTML = innerHTML;
    router.append(route);
    document.body.append(router);
    return route;
  }

  const routeInfo = {
    href: '/page',
    pathname: '/page',
    search: '',
    hash: '',
    pattern: '/page',
  };

  it('throws on render when page has no view', async () => {
    const route = mountRoute({ path: '/empty' });

    await expect(route.render({ ...routeInfo, href: '/empty', pathname: '/empty', pattern: '/empty' }))
      .rejects.toThrow('AuraRoute page "/empty" has no view');
  });

  it('throws on render when folder has no shell', async () => {
    const route = mountRoute(
      { path: '/settings' },
      '<aura-route path="profile" view="html::<p/>"></aura-route>',
    );

    await expect(route.render({
      ...routeInfo,
      href: '/settings',
      pathname: '/settings',
      pattern: '/settings',
    })).rejects.toThrow('AuraRoute folder "/settings" has no layout');
  });

  it('throws when folder declares view and children', async () => {
    const route = mountRoute(
      { path: '/settings', layout: 'shell', view: 'html::<p/>' },
      '<aura-route path="profile" view="html::<p/>"></aura-route>',
    );

    await expect(route.render({
      ...routeInfo,
      href: '/settings',
      pathname: '/settings',
      pattern: '/settings',
    })).rejects.toThrow('cannot declare view');
  });
});

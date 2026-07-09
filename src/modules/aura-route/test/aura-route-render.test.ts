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

  function mountRoute(attrs: Record<string, string>): AuraRoute {
    const router = document.createElement('aura-router');
    const route = document.createElement(AuraRoute.is) as AuraRoute;
    route.setAttribute('path', attrs.path ?? '/page');
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'path') continue;
      route.setAttribute(name, value);
    }
    router.append(route);
    document.body.append(router);
    return route;
  }

  it('throws on render when neither view nor layout is configured', async () => {
    const route = mountRoute({ path: '/empty' });

    await expect(
      route.render({
        href: '/empty',
        pathname: '/empty',
        search: '',
        hash: '',
        pattern: '/empty',
      }),
    ).rejects.toThrow('AuraRoute with path "/empty" has no view or layout to render');
  });
});

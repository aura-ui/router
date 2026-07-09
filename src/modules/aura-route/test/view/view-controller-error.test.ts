import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { RouteViewController } from '../../core/view/view-controller';
import { NO_TRANSITION } from '../../core/attr/transition-attr-parser';
import {
  NavigationError,
  NO_PRESERVE,
  type MatchedRouteInfo,
} from '../../../aura-routing-engine/core';

function matched(pathname: string): MatchedRouteInfo {
  return {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: pathname,
  } as MatchedRouteInfo;
}

describe('RouteViewController render errors', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('returns error result after mounting recovery UI without rethrowing', async () => {
    const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
    document.body.append(outlet);

    const loadError = new NavigationError({
      code: 'CONTENT_LOAD_FAILED',
      phase: 'render',
      routePattern: '/broken',
      message: 'load failed',
    });

    let passErrorEmitted = false;
    const controller = new RouteViewController(
      {
        route: {
          path: '/broken',
          layout: '',
          view: '',
          loadingTemplate: '',
          errorTemplate: '',
          scrollPolicy: null,
          preserve: NO_PRESERVE,
          transition: NO_TRANSITION,
        },
        view: {
          loadView: async () => {
            throw loadError;
          },
        },
        cache: { extract: () => undefined, put: () => {} },
        mountTarget: {
          appOutlet: () => outlet,
          nestedOutlet: () => null,
        },
        plugins: [
          {
            onPassError: () => {
              passErrorEmitted = true;
            },
          },
        ],
      },
      () => 1,
    );

    const result = await controller.render(matched('/broken'));

    expect(result).toEqual({ status: 'error', error: loadError });
    expect(passErrorEmitted).toBe(true);
    expect(outlet.textContent).toContain('Content Loading Error');
  });
});

import { NavigationError } from '../../../aura-routing-engine/core';
import { RouteViewController } from '../../core/view/view-controller';
import {
  createMatchedRouteInfo,
  createNoopDomCache,
  createOutlet,
  createRouteStub,
  defineAuraOutlet,
} from '../_helpers';

describe('RouteViewController render errors', () => {
  beforeAll(() => {
    defineAuraOutlet();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('returns error result after mounting recovery UI without rethrowing', async () => {
    const outlet = createOutlet();

    const loadError = new NavigationError({
      code: 'CONTENT_LOAD_FAILED',
      phase: 'render',
      routePattern: '/broken',
      message: 'load failed',
    });

    let passErrorEmitted = false;
    const controller = new RouteViewController(
      {
        route: createRouteStub({ path: '/broken' }),
        view: {
          loadView: async () => {
            throw loadError;
          },
        },
        cache: createNoopDomCache(),
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

    const result = await controller.resolveAndMountView(createMatchedRouteInfo('/broken'));

    expect(result).toEqual({ status: 'error', error: loadError });
    expect(passErrorEmitted).toBe(true);
    expect(outlet.textContent).toContain('Content Loading Error');
  });
});

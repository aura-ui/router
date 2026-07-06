import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_PRESERVE, type MatchedRouteInfo } from '../../../aura-routing-engine/core';
import { RouteViewController } from '../../core/view/view-controller';
import { NO_TRANSITION } from '../../core/attr/transition-attr-parser';
import type { AuraRouteInterface, RouteRenderOptions } from '../../core/types';

function matched(pathname: string): MatchedRouteInfo {
  return {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: 'user/:id',
  } as MatchedRouteInfo;
}

function route(overrides: Partial<AuraRouteInterface> = {}): AuraRouteInterface {
  return {
    path: 'user/:id',
    layout: '',
    view: null,
    loadingTemplate: '',
    errorTemplate: '',
    scrollPolicy: null,
    preserve: NO_PRESERVE,
    transition: NO_TRANSITION,
    hasLayout: false,
    hasGuard: false,
    hasLeave: false,
    hasLoad: false,
    hasTransitionIn: false,
    hasReady: false,
    hasAsyncContent: false,
    hasSyncContent: false,
    ...overrides,
  };
}

async function captureUseStagedMount(
  routeConfig: AuraRouteInterface,
  routeInfo: MatchedRouteInfo,
  options?: RouteRenderOptions,
): Promise<boolean | undefined> {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);

  let useStagedMount: boolean | undefined;

  const controller = new RouteViewController(
    {
      route: routeConfig,
      content: { resolve: async () => '<span>view</span>' },
      cache: { extract: () => undefined, put: () => {} },
      mountTarget: { appOutlet: () => outlet, nestedOutlet: () => null },
      plugins: [{
        onContentResolved(pass) {
          useStagedMount = pass.useStagedMount;
        },
      }],
    },
    () => 1,
  );

  await controller.render(routeInfo, options);
  return useStagedMount;
}

describe('RouteViewController RenderPass.useStagedMount', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('stages when route declares transition order', async () => {
    const value = await captureUseStagedMount(
      route({ transition: { order: 'parallel', in: ['fade'], out: ['fade'] } }),
      matched('/users/1'),
    );

    expect(value).toBe(true);
  });

  it('stages on param-change remount with preserve.view', async () => {
    const value = await captureUseStagedMount(
      route({ preserve: { view: true, data: false } }),
      matched('/users/2'),
      { paramChangeRemount: true },
    );

    expect(value).toBe(true);
  });

  it('replaces on param-change remount without preserve.view', async () => {
    const value = await captureUseStagedMount(
      route({ preserve: NO_PRESERVE }),
      matched('/users/2'),
      { paramChangeRemount: true },
    );

    expect(value).toBe(false);
  });

  it('replaces on ordinary navigation without transition', async () => {
    const value = await captureUseStagedMount(
      route({ preserve: { view: true, data: false } }),
      matched('/users/2'),
    );

    expect(value).toBe(false);
  });
});

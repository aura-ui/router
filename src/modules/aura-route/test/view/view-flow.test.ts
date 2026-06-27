import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo } from '../../../aura-route-hooks/core';
import { RouteViewController } from '../../core/view/view-controller';
import { defaultViewCache } from '../../core/view/view-cache';
import { NO_PRESERVE } from '../../../aura-routing-engine/core/content/preserve';
import type { AuraRouteInterface } from '../../core/types';
import type { ContentResolverPort } from '../../core/view/ports';
import { NO_TRANSITION } from '../../core/transition/transition';

function createOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

function matched(pathname: string, pattern = pathname): MatchedRouteInfo {
  return {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern,
  } as MatchedRouteInfo;
}

function createController(
  root: AuraOutlet,
  content: ContentResolverPort,
  path = '/',
  staged = false,
): { controller: RouteViewController; route: AuraRouteInterface } {
  let passId = 0;
  const route: AuraRouteInterface = {
    path,
    layout: '',
    view: '',
    loadingTemplate: '',
    errorTemplate: '',
    preserve: NO_PRESERVE,
    restoreScroll: false,
    get transition() {
      return staged
        ? { order: 'parallel' as const, in: null, out: null }
        : NO_TRANSITION;
    },
  };

  const controller = new RouteViewController(
    {
      route,
      content,
      cache: defaultViewCache,
      mountTarget: {
        appOutlet: () => root,
        nestedOutlet: () => null,
      },
    },
    () => passId,
  );

  const originalRender = controller.render.bind(controller);
  controller.render = async (...args) => {
    passId++;
    return originalRender(...args);
  };

  return { controller, route };
}

describe('view flow (controller → outlet)', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('staged transition: render stages, commitStagedView commits after transition hooks', async () => {
    const root = createOutlet();
    let resolveCount = 0;
    const { controller } = createController(root, {
      resolve: async (routeInfo) => {
        resolveCount++;
        if (routeInfo?.pathname === '/old') return '<span>old</span>';
        return '<span>new</span>';
      },
    }, '/', true);

    await controller.render(matched('/old'));
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('old');

    await controller.render(matched('/new'));
    expect(root.children).toHaveLength(2);
    expect(root.textContent).toBe('oldnew');

    controller.commitStagedView();
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('new');
    expect(resolveCount).toBe(2);
  });

  it('without active transition render replaces instead of stage', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      resolve: async (routeInfo) =>
        routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>',
    });

    await controller.render(matched('/old'));
    await controller.render(matched('/new'));
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('new');
  });

  it('cancelPendingRender drops staged view and keeps active view', async () => {
    const root = createOutlet();
    const { controller, route } = createController(root, {
      resolve: async (routeInfo) =>
        routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>',
    }, '/', true);

    await controller.render(matched('/old'));
    await controller.render(matched('/new'));
    expect(root.children).toHaveLength(2);

    controller.cancelPendingRender();
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('old');

    Object.defineProperty(route, 'transition', {
      get: () => NO_TRANSITION,
      configurable: true,
    });
    await controller.render(matched('/old'));
    expect(root.textContent).toBe('old');
    expect(root.children).toHaveLength(1);
  });

  it('onLeft during stage removes staged view and unmounts the leaving route view', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      resolve: async (routeInfo) =>
        routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>',
    }, '/', true);

    await controller.render(matched('/old'));
    await controller.render(matched('/new'));
    expect(root.children).toHaveLength(2);

    controller.onLeft();
    expect(root.children).toHaveLength(0);
  });

  it('onLeft clears a committed single view', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      resolve: async () => '<span>page</span>',
    });

    await controller.render(matched('/page'));
    expect(root.children).toHaveLength(1);

    controller.onLeft();
    expect(root.children).toHaveLength(0);
  });
});

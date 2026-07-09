import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_PRESERVE, type MatchedRouteInfo } from '../../../aura-routing-engine/core';
import { RouteViewController } from '../../core/view/view-controller';
import { defaultViewCache } from '../../core/view/view-cache';
import type { AuraRouteInterface } from '../../core/types';
import type { ContentResolverPort } from '../../core/view/types';
import { NO_TRANSITION } from '../../core/attr/transition-attr-parser';

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
    scrollPolicy: null,
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
      loadView: async (routeInfo) => {
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
      loadView: async (routeInfo) =>
        routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>',
    });

    await controller.render(matched('/old'));
    await controller.render(matched('/new'));
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('new');
  });

  it('revertInFlightView restores replace mount from detached snapshot', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async (routeInfo) =>
        routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>',
    });

    await controller.render(matched('/old'));
    await controller.render(matched('/new'));
    expect(root.textContent).toBe('new');

    controller.revertInFlightView();
    expect(root.textContent).toBe('old');
  });

  it('commitStagedView discards pending outgoing so replace cannot roll back', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async (routeInfo) =>
        routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>',
    });

    await controller.render(matched('/old'));
    await controller.render(matched('/new'));

    controller.commitStagedView();
    controller.revertInFlightView();

    expect(root.textContent).toBe('new');
  });

  it('revertInFlightView rolls back staged mount and clears presentation', async () => {
    const root = createOutlet();
    const { controller, route } = createController(root, {
      loadView: async (routeInfo) =>
        routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>',
    }, '/', true);

    await controller.render(matched('/old'));
    await controller.render(matched('/new'));
    expect(root.children).toHaveLength(2);

    controller.revertInFlightView();
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

  it('revertInFlightView clears transition inline styles on active view', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async () => '<span>page</span>',
    });

    await controller.render(matched('/page'));
    const viewRoot = root.firstElementChild as HTMLElement;
    viewRoot.style.opacity = '0';
    viewRoot.style.transform = 'translateX(-1.25rem)';

    controller.revertInFlightView();

    expect(viewRoot.style.opacity).toBe('');
    expect(viewRoot.style.transform).toBe('');
  });

  it('onUnmount during stage removes staged view and unmounts the leaving route view', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async (routeInfo) =>
        routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>',
    }, '/', true);

    await controller.render(matched('/old'));
    await controller.render(matched('/new'));
    expect(root.children).toHaveLength(2);

    controller.onUnmount();
    expect(root.children).toHaveLength(0);
  });

  it('onUnmount clears a committed single view', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async () => '<span>page</span>',
    });

    await controller.render(matched('/page'));
    expect(root.children).toHaveLength(1);

    controller.onUnmount();
    expect(root.children).toHaveLength(0);
  });
});

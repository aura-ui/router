import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_TRANSITION } from '../../core/attr/transition-attr-parser';
import { defaultDomCache } from '../../core/view/dom-cache';
import { RouteViewController } from '../../core/view/view-controller';
import {
  createMatchedRouteInfo,
  createOutlet,
  createRouteStub,
  defineAuraOutlet,
} from '../_helpers';
import type { AuraRouteInterface } from '../../core/types';
import type { ViewResolverPort } from '../../core/view/types';

function createController(
  root: AuraOutlet,
  view: ViewResolverPort,
  path = '/',
  staged = false,
): { controller: RouteViewController; route: AuraRouteInterface } {
  let passId = 0;
  const route = createRouteStub({
    path,
    view: { loader: 'html', content: '' },
    hasViewContent: true,
    transition: staged
      ? { order: 'parallel', in: null, out: null }
      : NO_TRANSITION,
  });

  const controller = new RouteViewController(
    {
      route,
      view,
      cache: defaultDomCache,
      mountTarget: {
        appOutlet: () => root,
        nestedOutlet: () => null,
      },
    },
    () => passId,
  );

  const originalRender = controller.resolveAndMountView.bind(controller);
  controller.resolveAndMountView = async (...args) => {
    passId++;
    return originalRender(...args);
  };

  return { controller, route };
}

describe('view flow (controller → outlet)', () => {
  beforeAll(() => {
    defineAuraOutlet();
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
        if (routeInfo?.pathname === '/old') return { payload: '<span>old</span>' };
        return { payload: '<span>new</span>' };
      },
    }, '/', true);

    await controller.resolveAndMountView(createMatchedRouteInfo('/old'));
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('old');

    await controller.resolveAndMountView(createMatchedRouteInfo('/new'));
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
        ({ payload: routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>' }),
    });

    await controller.resolveAndMountView(createMatchedRouteInfo('/old'));
    await controller.resolveAndMountView(createMatchedRouteInfo('/new'));
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('new');
  });

  it('revertInFlightView restores replace mount from detached snapshot', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async (routeInfo) =>
        ({ payload: routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>' }),
    });

    await controller.resolveAndMountView(createMatchedRouteInfo('/old'));
    await controller.resolveAndMountView(createMatchedRouteInfo('/new'));
    expect(root.textContent).toBe('new');

    controller.revertInFlightView();
    expect(root.textContent).toBe('old');
  });

  it('commitStagedView discards pending outgoing so replace cannot roll back', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async (routeInfo) =>
        ({ payload: routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>' }),
    });

    await controller.resolveAndMountView(createMatchedRouteInfo('/old'));
    await controller.resolveAndMountView(createMatchedRouteInfo('/new'));

    controller.commitStagedView();
    controller.revertInFlightView();

    expect(root.textContent).toBe('new');
  });

  it('revertInFlightView rolls back staged mount and clears presentation', async () => {
    const root = createOutlet();
    const { controller, route } = createController(root, {
      loadView: async (routeInfo) =>
        ({ payload: routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>' }),
    }, '/', true);

    await controller.resolveAndMountView(createMatchedRouteInfo('/old'));
    await controller.resolveAndMountView(createMatchedRouteInfo('/new'));
    expect(root.children).toHaveLength(2);

    controller.revertInFlightView();
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe('old');

    Object.assign(route, { transition: NO_TRANSITION });
    await controller.resolveAndMountView(createMatchedRouteInfo('/old'));
    expect(root.textContent).toBe('old');
    expect(root.children).toHaveLength(1);
  });

  it('revertInFlightView clears transition inline styles on active view', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async () => ({ payload: '<span>page</span>' }),
    });

    await controller.resolveAndMountView(createMatchedRouteInfo('/page'));
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
        ({ payload: routeInfo?.pathname === '/old' ? '<span>old</span>' : '<span>new</span>' }),
    }, '/', true);

    await controller.resolveAndMountView(createMatchedRouteInfo('/old'));
    await controller.resolveAndMountView(createMatchedRouteInfo('/new'));
    expect(root.children).toHaveLength(2);

    controller.onUnmount();
    expect(root.children).toHaveLength(0);
  });

  it('onUnmount clears a committed single view', async () => {
    const root = createOutlet();
    const { controller } = createController(root, {
      loadView: async () => ({ payload: '<span>page</span>' }),
    });

    await controller.resolveAndMountView(createMatchedRouteInfo('/page'));
    expect(root.children).toHaveLength(1);

    controller.onUnmount();
    expect(root.children).toHaveLength(0);
  });
});

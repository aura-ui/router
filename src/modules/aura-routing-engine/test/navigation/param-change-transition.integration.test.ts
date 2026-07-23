jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../_helpers/jest/mock-hooks-registry').mockHooksRegistry());

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree/route-node.types';
import type { ViewGraph } from '../../core/view-graph';
import {
  createUsersIdMatch,
  createUsersIdNode,
} from '../_helpers/create-dynamic-leaf-match';
import {
  createMockEngine,
  createNavigationTransaction,
  createViewGraphFromLoadView,
  wireEngineViewGraph,
} from '../_helpers/create-mock-transaction';
import { setupViewIntegrationTests } from '../_helpers/integration-setup';
import { mockRunPhaseHooks, resetHookMocks } from '../_helpers/jest/hook-mocks';
import {
  createTestOutlet,
  PARALLEL_CROSS_FADE_TRANSITION,
} from '../_helpers/jest/navigation-fixtures';
import {
  loadViewFromParamId,
  wireRouteViewController as wireRouteView,
  type WireRouteViewControllerOptions,
} from '../_helpers/wire-route-view-controller';

type WireOptions = Pick<
  WireRouteViewControllerOptions,
  'cacheDom' | 'transition' | 'onTransitionOut' | 'onTransitionIn'
>;

function viewMarkup(id: string): string {
  return `<span data-user-id="${id}">view-${id}</span>`;
}

function queryViewRoot(outlet: AuraOutlet, id: string): Element | null {
  return outlet.querySelector(`[data-user-id="${id}"]`);
}

let lastWiredLoadView: ViewGraph['loadView'] | null = null;

function wireRouteViewController(
  node: RouteNode,
  outlet: AuraOutlet,
  resolve: (id: string) => string,
  options: WireOptions = {},
) {
  const loadView = loadViewFromParamId(resolve);
  lastWiredLoadView = loadView;
  return wireRouteView({
    route: node.route,
    path: node.pattern,
    outlet,
    loadView,
    ...options,
  });
}

async function runParamRemountNavigation(
  from: MatchedRouteInfo,
  to: MatchedRouteInfo,
  loadView: NonNullable<typeof lastWiredLoadView> = lastWiredLoadView!,
) {
  const engine = createMockEngine();
  wireEngineViewGraph(engine, createViewGraphFromLoadView(loadView));

  const transaction = createNavigationTransaction({
    engine,
    from,
    to,
  });

  return {
    result: await transaction.run(),
    transaction,
  };
}

function createTransitionNode(transition: RouteTransitionType) {
  return createUsersIdNode({
    view: { loader: 'url', content: 'content/user/{{id}}.html' },
    transition,
    transitionIn: transition.in,
    transitionOut: transition.out,
    unmount: ['cleanup'],
    ready: ['analytics'],
  });
}

describe('param-change in-place + transition integration (real view)', () => {
  setupViewIntegrationTests();

  it('parallel crossfade: both view roots visible during transition hooks', async () => {
    const outlet = createTestOutlet();
    const transitionSnapshots: Array<{ phase: string; childCount: number }> = [];

    const node = createTransitionNode(PARALLEL_CROSS_FADE_TRANSITION);
    wireRouteViewController(node, outlet, viewMarkup, {
      transition: PARALLEL_CROSS_FADE_TRANSITION,
      onTransitionOut: (_ctx, root) => {
        transitionSnapshots.push({ phase: 'transitionOut', childCount: root.children.length });
        expect(queryViewRoot(root, '1')).not.toBeNull();
        expect(queryViewRoot(root, '2')).not.toBeNull();
      },
      onTransitionIn: (_ctx, root) => {
        transitionSnapshots.push({ phase: 'transitionIn', childCount: root.children.length });
        expect(queryViewRoot(root, '1')).not.toBeNull();
        expect(queryViewRoot(root, '2')).not.toBeNull();
      },
    });

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
    expect(outlet.children).toHaveLength(1);
    expect(queryViewRoot(outlet, '1')).not.toBeNull();

    const { result, transaction } = await runParamRemountNavigation(from, to);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.paramChangeRemount).toBe(true);
    expect(transaction.transitionPlan.transitionOrder).toBe('parallel');

    expect(transitionSnapshots).toEqual([
      { phase: 'transitionOut', childCount: 2 },
      { phase: 'transitionIn', childCount: 2 },
    ]);

    expect(outlet.children).toHaveLength(1);
    expect(queryViewRoot(outlet, '1')).toBeNull();
    expect(queryViewRoot(outlet, '2')).not.toBeNull();
    expect(outlet.textContent).toBe('view-2');
  });

  it('parallel crossfade: incoming survives unmount, outgoing removed once', async () => {
    const outlet = createTestOutlet();
    let outgoingConnectedAtUnmount = false;
    let incomingConnectedAtUnmount = false;
    let outletChildCountAtUnmount = -1;

    const node = createTransitionNode(PARALLEL_CROSS_FADE_TRANSITION);
    const { controller } = wireRouteViewController(node, outlet, viewMarkup, {
      transition: PARALLEL_CROSS_FADE_TRANSITION,
    });

    const originalOnUnmount = controller.onUnmount.bind(controller);
    let unmountCalls = 0;
    controller.onUnmount = (options) => {
      unmountCalls++;
      outletChildCountAtUnmount = outlet.children.length;
      outgoingConnectedAtUnmount = queryViewRoot(outlet, '1')?.isConnected ?? false;
      incomingConnectedAtUnmount = queryViewRoot(outlet, '2')?.isConnected ?? false;
      originalOnUnmount(options);
    };

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
    await runParamRemountNavigation(from, to);

    expect(unmountCalls).toBe(1);
    expect(outletChildCountAtUnmount).toBe(2);
    expect(incomingConnectedAtUnmount).toBe(true);
    expect(outgoingConnectedAtUnmount).toBe(true);
    expect(queryViewRoot(outlet, '1')).toBeNull();
    expect(queryViewRoot(outlet, '2')?.isConnected).toBe(true);
    expect(outlet.children).toHaveLength(1);
  });

  it.each([
    ['out-in', 'out-in'],
    ['in-out', 'in-out'],
  ] as const)('%s policy completes in-place remount with staged crossfade', async (_label, order) => {
    const outlet = createTestOutlet();
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const transition: RouteTransitionType = {
      order,
      in: ['fade-in'],
      out: ['fade-out'],
    };
    const node = createTransitionNode(transition);
    wireRouteViewController(node, outlet, viewMarkup, { transition });

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
    const { result, transaction } = await runParamRemountNavigation(from, to);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.paramChangeRemount).toBe(true);
    expect(transaction.transitionPlan.transitionOrder).toBe(order);
    expect(phases).toContain('transitionOut');
    expect(phases).toContain('transitionIn');
    expect(phases).toContain('unmount');
    expect(phases).toContain('ready');
    expect(phases.indexOf('unmount')).toBeLessThan(phases.indexOf('ready'));

    expect(outlet.children).toHaveLength(1);
    expect(queryViewRoot(outlet, '2')).not.toBeNull();
    expect(queryViewRoot(outlet, '1')).toBeNull();
  });

  it('out-in: transitionOut runs before render (only outgoing in outlet)', async () => {
    const outlet = createTestOutlet();
    let childCountDuringTransitionOut = -1;

    const transition: RouteTransitionType = {
      order: 'out-in',
      in: ['fade-in'],
      out: ['fade-out'],
    };
    const node = createTransitionNode(transition);
    wireRouteViewController(node, outlet, viewMarkup, {
      transition,
      onTransitionOut: (_ctx, root) => {
        childCountDuringTransitionOut = root.children.length;
      },
    });

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
    await runParamRemountNavigation(from, to);

    expect(childCountDuringTransitionOut).toBe(1);
    expect(queryViewRoot(outlet, '1')).toBeNull();
    expect(queryViewRoot(outlet, '2')).not.toBeNull();
  });

  it('in-out: transitionIn runs after render (both layers), before transitionOut', async () => {
    const outlet = createTestOutlet();
    const transitionSnapshots: Array<{ phase: string; childCount: number }> = [];

    const transition: RouteTransitionType = {
      order: 'in-out',
      in: ['fade-in'],
      out: ['fade-out'],
    };
    const node = createTransitionNode(transition);
    wireRouteViewController(node, outlet, viewMarkup, {
      transition,
      onTransitionIn: (_ctx, root) => {
        transitionSnapshots.push({ phase: 'transitionIn', childCount: root.children.length });
        expect(queryViewRoot(root, '1')).not.toBeNull();
        expect(queryViewRoot(root, '2')).not.toBeNull();
      },
      onTransitionOut: (_ctx, root) => {
        transitionSnapshots.push({ phase: 'transitionOut', childCount: root.children.length });
        expect(queryViewRoot(root, '1')).not.toBeNull();
        expect(queryViewRoot(root, '2')).not.toBeNull();
      },
    });

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
    await runParamRemountNavigation(from, to);

    expect(transitionSnapshots).toEqual([
      { phase: 'transitionIn', childCount: 2 },
      { phase: 'transitionOut', childCount: 2 },
    ]);
    expect(queryViewRoot(outlet, '1')).toBeNull();
    expect(queryViewRoot(outlet, '2')).not.toBeNull();
  });

  it('cache.dom + parallel: crossfade with outgoing stashed on unmount', async () => {
    const outlet = createTestOutlet();
    const transitionSnapshots: Array<{ phase: string; childCount: number }> = [];

    const node = createUsersIdNode({
      cache: { dom: true, view: false, data: false },
      view: { loader: 'url', content: 'content/user/{{id}}.html' },
      transition: PARALLEL_CROSS_FADE_TRANSITION,
      transitionIn: PARALLEL_CROSS_FADE_TRANSITION.in,
      transitionOut: PARALLEL_CROSS_FADE_TRANSITION.out,
      unmount: ['cleanup'],
      ready: ['analytics'],
    });
    const { stash } = wireRouteViewController(node, outlet, viewMarkup, {
      cacheDom: true,
      transition: PARALLEL_CROSS_FADE_TRANSITION,
      onTransitionOut: (_ctx, root) => {
        transitionSnapshots.push({ phase: 'transitionOut', childCount: root.children.length });
        expect(queryViewRoot(root, '1')).not.toBeNull();
        expect(queryViewRoot(root, '2')).not.toBeNull();
      },
      onTransitionIn: (_ctx, root) => {
        transitionSnapshots.push({ phase: 'transitionIn', childCount: root.children.length });
        expect(queryViewRoot(root, '1')).not.toBeNull();
        expect(queryViewRoot(root, '2')).not.toBeNull();
      },
    });

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
    const { result, transaction } = await runParamRemountNavigation(from, to);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.paramChangeRemount).toBe(true);
    expect(transaction.transitionPlan.transitionOrder).toBe('parallel');
    expect(transitionSnapshots).toEqual([
      { phase: 'transitionOut', childCount: 2 },
      { phase: 'transitionIn', childCount: 2 },
    ]);
    expect(stash.has('/users/1')).toBe(true);
    expect(outlet.children).toHaveLength(1);
    expect(queryViewRoot(outlet, '2')).not.toBeNull();
    expect(queryViewRoot(outlet, '1')).toBeNull();
  });

  it('ordinary staged transition unmount clears both layers (contrast with param remount path)', async () => {
    const outlet = createTestOutlet();
    const node = createTransitionNode(PARALLEL_CROSS_FADE_TRANSITION);
    const { controller } = wireRouteViewController(node, outlet, viewMarkup, {
      transition: PARALLEL_CROSS_FADE_TRANSITION,
    });

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await controller.render(from);
    await controller.render(to);
    expect(outlet.children).toHaveLength(2);

    controller.onUnmount();
    expect(outlet.children).toHaveLength(0);
  });
});

describe('param-change in-place + transition pipeline order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHookMocks();
  });

  it.each([
    ['parallel', ['transitionOut', 'transitionIn', 'unmount', 'ready']],
    ['out-in', ['transitionOut', 'transitionIn', 'unmount', 'ready']],
    ['in-out', ['transitionIn', 'transitionOut', 'unmount', 'ready']],
  ] as const)('%s full pipeline: unmount before ready, commit after unmount', async (order, expectedMiddle) => {
    const callOrder: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      callOrder.push(ctx.phase);
    });

    const outlet = createTestOutlet();
    const transition: RouteTransitionType = {
      order,
      in: ['fade-in'],
      out: ['fade-out'],
    };
    const node = createTransitionNode(transition);
    const { loadView } = wireRouteViewController(node, outlet, viewMarkup, { transition });

    const exitRoute = createUsersIdMatch('1', node);
    const enterRoute = createUsersIdMatch('2', node);

    const engine = createMockEngine();
    wireEngineViewGraph(engine, createViewGraphFromLoadView(loadView));

    const transaction = createNavigationTransaction({
      engine,
      from: exitRoute,
      to: enterRoute,
    });

    await exitRoute.route.render(exitRoute);

    const result = await transaction.run();

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.paramChangeRemount).toBe(true);

    const unmountIdx = callOrder.indexOf('unmount');
    const readyIdx = callOrder.indexOf('ready');
    expect(unmountIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(unmountIdx);

    for (const phase of expectedMiddle) {
      expect(callOrder).toContain(phase);
    }

    if (order === 'parallel') {
      expect(callOrder.indexOf('transitionOut')).toBeLessThan(callOrder.indexOf('unmount'));
      expect(callOrder.indexOf('transitionIn')).toBeLessThan(callOrder.indexOf('unmount'));
    }
    if (order === 'out-in') {
      expect(callOrder.indexOf('transitionOut')).toBeLessThan(callOrder.indexOf('transitionIn'));
      expect(callOrder.indexOf('transitionIn')).toBeLessThan(callOrder.indexOf('unmount'));
    }
    if (order === 'in-out') {
      expect(callOrder.indexOf('transitionIn')).toBeLessThan(callOrder.indexOf('transitionOut'));
      expect(callOrder.indexOf('transitionOut')).toBeLessThan(callOrder.indexOf('unmount'));
    }

    expect(outlet.children).toHaveLength(1);
    expect(queryViewRoot(outlet, '2')).not.toBeNull();
  });
});

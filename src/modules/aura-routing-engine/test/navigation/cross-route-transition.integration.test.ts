jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../_helpers/jest/mock-hooks-registry').mockHooksRegistry());

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import { NO_TRANSITION } from '../../../aura-route/core/attr/transition-attr-parser';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteInstance } from '../../core/route/types';
import {
  createMatchedRoute,
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
  wireRouteViewController,
  type WireRouteViewControllerOptions,
} from '../_helpers/wire-route-view-controller';

const routeMarkup = new WeakMap<RouteInstance, string>();

type WiredRoute = {
  match: MatchedRouteInfo;
  controller: ReturnType<typeof wireRouteViewController>['controller'];
};

type WireRouteOptions = Pick<
  WireRouteViewControllerOptions,
  'transition' | 'onTransitionOut' | 'onTransitionIn'
>;

function viewMarkup(label: string): string {
  return `<span data-route="${label}">${label}-view</span>`;
}

function queryRouteView(outlet: AuraOutlet, label: string): Element | null {
  return outlet.querySelector(`[data-route="${label}"]`);
}

function wireRoute(
  outlet: AuraOutlet,
  path: string,
  markup: string,
  options: WireRouteOptions = {},
): WiredRoute {
  const transition = options.transition ?? NO_TRANSITION;
  const match = createMatchedRoute(path, {
    transition,
    transitionIn: transition.in,
    transitionOut: transition.out,
  });

  const wired = wireRouteViewController({
    route: match.route,
    outlet,
    cache: NO_CACHE,
    wireRevertInFlight: true,
    loadView: async () => ({ payload: markup }),
    ...options,
    transition,
  });
  routeMarkup.set(match.route, markup);

  return { match, controller: wired.controller };
}

async function runCrossRouteNavigation(from: MatchedRouteInfo, to: MatchedRouteInfo) {
  const engine = createMockEngine();
  wireEngineViewGraph(
    engine,
    createViewGraphFromLoadView(async (routeInfo) => ({
      payload: routeMarkup.get(routeInfo.route) ?? null,
    })),
  );

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

describe('cross-route transition integration (real view)', () => {
  setupViewIntegrationTests();

  it('parallel crossfade: both view roots visible during transition hooks', async () => {
    const outlet = createTestOutlet();
    const transitionSnapshots: Array<{ phase: string; childCount: number }> = [];

    const from = wireRoute(outlet, '/from', viewMarkup('from'), {
      transition: PARALLEL_CROSS_FADE_TRANSITION,
      onTransitionOut: (_ctx, root) => {
        transitionSnapshots.push({ phase: 'transitionOut', childCount: root.children.length });
        expect(queryRouteView(root, 'from')).not.toBeNull();
        expect(queryRouteView(root, 'to')).not.toBeNull();
      },
    });
    const to = wireRoute(outlet, '/to', viewMarkup('to'), {
      transition: PARALLEL_CROSS_FADE_TRANSITION,
      onTransitionIn: (_ctx, root) => {
        transitionSnapshots.push({ phase: 'transitionIn', childCount: root.children.length });
        expect(queryRouteView(root, 'from')).not.toBeNull();
        expect(queryRouteView(root, 'to')).not.toBeNull();
      },
    });

    await from.match.route.resolveAndMountView(from.match);
    expect(outlet.children).toHaveLength(1);
    expect(queryRouteView(outlet, 'from')).not.toBeNull();

    const { result, transaction } = await runCrossRouteNavigation(from.match, to.match);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.paramChangeRemount).toBeFalsy();
    expect(transaction.transitionPlan.update).toBe(false);
    expect(transaction.transitionPlan.transitionOrder).toBe('parallel');

    expect(transitionSnapshots).toEqual([
      { phase: 'transitionOut', childCount: 2 },
      { phase: 'transitionIn', childCount: 2 },
    ]);

    expect(outlet.children).toHaveLength(1);
    expect(queryRouteView(outlet, 'from')).toBeNull();
    expect(queryRouteView(outlet, 'to')).not.toBeNull();
    expect(outlet.textContent).toBe('to-view');
  });

  it('parallel crossfade: exit unmount runs once, enter view survives commit', async () => {
    const outlet = createTestOutlet();
    let exitUnmountCalls = 0;
    let exitConnectedAtUnmount = false;
    let enterConnectedAtUnmount = false;
    let outletChildCountAtUnmount = -1;

    const from = wireRoute(outlet, '/from', viewMarkup('from'), {
      transition: PARALLEL_CROSS_FADE_TRANSITION,
    });
    const to = wireRoute(outlet, '/to', viewMarkup('to'), {
      transition: PARALLEL_CROSS_FADE_TRANSITION,
    });

    const originalExitUnmount = from.controller.onUnmount.bind(from.controller);
    from.controller.onUnmount = (options) => {
      exitUnmountCalls++;
      outletChildCountAtUnmount = outlet.children.length;
      exitConnectedAtUnmount = queryRouteView(outlet, 'from')?.isConnected ?? false;
      enterConnectedAtUnmount = queryRouteView(outlet, 'to')?.isConnected ?? false;
      originalExitUnmount(options);
    };

    await from.match.route.resolveAndMountView(from.match);
    await runCrossRouteNavigation(from.match, to.match);

    expect(exitUnmountCalls).toBe(1);
    expect(outletChildCountAtUnmount).toBe(2);
    expect(enterConnectedAtUnmount).toBe(true);
    expect(exitConnectedAtUnmount).toBe(true);
    expect(queryRouteView(outlet, 'to')?.isConnected).toBe(true);
    expect(queryRouteView(outlet, 'from')).toBeNull();
    expect(outlet.children).toHaveLength(1);
  });

  it.each([
    ['out-in', 'out-in'],
    ['in-out', 'in-out'],
  ] as const)('%s policy completes cross-route navigation with staged enter view', async (_label, order) => {
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

    const from = wireRoute(outlet, '/from', viewMarkup('from'), { transition });
    const to = wireRoute(outlet, '/to', viewMarkup('to'), { transition });

    await from.match.route.resolveAndMountView(from.match);
    const { result, transaction } = await runCrossRouteNavigation(from.match, to.match);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.exitRoutes).toHaveLength(1);
    expect(transaction.transitionPlan.enterRoutes).toHaveLength(1);
    expect(transaction.transitionPlan.exitRoutes[0]!.pattern).toBe('/from');
    expect(transaction.transitionPlan.enterRoutes[0]!.pattern).toBe('/to');
    expect(phases).toContain('transitionOut');
    expect(phases).toContain('transitionIn');
    expect(phases).toContain('unmount');
    expect(phases).toContain('ready');
    expect(phases.indexOf('unmount')).toBeLessThan(phases.indexOf('ready'));

    expect(outlet.children).toHaveLength(1);
    expect(queryRouteView(outlet, 'to')).not.toBeNull();
    expect(queryRouteView(outlet, 'from')).toBeNull();
  });

  it('out-in: transitionOut runs before enter render (only exit view in outlet)', async () => {
    const outlet = createTestOutlet();
    let childCountDuringTransitionOut = -1;

    const transition: RouteTransitionType = {
      order: 'out-in',
      in: ['fade-in'],
      out: ['fade-out'],
    };

    const from = wireRoute(outlet, '/from', viewMarkup('from'), {
      transition,
      onTransitionOut: (_ctx, root) => {
        childCountDuringTransitionOut = root.children.length;
        expect(queryRouteView(root, 'from')).not.toBeNull();
        expect(queryRouteView(root, 'to')).toBeNull();
      },
    });
    const to = wireRoute(outlet, '/to', viewMarkup('to'), { transition });

    await from.match.route.resolveAndMountView(from.match);
    await runCrossRouteNavigation(from.match, to.match);

    expect(childCountDuringTransitionOut).toBe(1);
    expect(queryRouteView(outlet, 'to')).not.toBeNull();
    expect(queryRouteView(outlet, 'from')).toBeNull();
  });

  it('without transition: enter render replaces exit view immediately', async () => {
    const outlet = createTestOutlet();

    const from = wireRoute(outlet, '/from', viewMarkup('from'));
    const to = wireRoute(outlet, '/to', viewMarkup('to'));

    await from.match.route.resolveAndMountView(from.match);
    await runCrossRouteNavigation(from.match, to.match);

    expect(outlet.children).toHaveLength(1);
    expect(queryRouteView(outlet, 'to')).not.toBeNull();
    expect(queryRouteView(outlet, 'from')).toBeNull();
  });
});

describe('cross-route transition pipeline order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHookMocks();
    document.body.replaceChildren();
  });

  it.each([
    ['parallel', ['transitionOut', 'transitionIn', 'unmount', 'ready']],
    ['out-in', ['transitionOut', 'transitionIn', 'unmount', 'ready']],
    ['in-out', ['transitionIn', 'transitionOut', 'unmount', 'ready']],
  ] as const)('%s: transitions before unmount, unmount before ready', async (order, expectedPhases) => {
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

    const from = wireRoute(outlet, '/from', viewMarkup('from'), { transition });
    const to = wireRoute(outlet, '/to', viewMarkup('to'), { transition });

    await from.match.route.resolveAndMountView(from.match);
    const { result, transaction } = await runCrossRouteNavigation(from.match, to.match);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.transitionOrder).toBe(order);

    const unmountIdx = callOrder.indexOf('unmount');
    const readyIdx = callOrder.indexOf('ready');
    expect(unmountIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(unmountIdx);

    for (const phase of expectedPhases) {
      expect(callOrder).toContain(phase);
    }

    if (order === 'parallel') {
      expect(callOrder.indexOf('transitionOut')).toBeLessThan(unmountIdx);
      expect(callOrder.indexOf('transitionIn')).toBeLessThan(unmountIdx);
    }
    if (order === 'out-in') {
      expect(callOrder.indexOf('transitionOut')).toBeLessThan(callOrder.indexOf('transitionIn'));
      expect(callOrder.indexOf('transitionIn')).toBeLessThan(unmountIdx);
    }
    if (order === 'in-out') {
      expect(callOrder.indexOf('transitionIn')).toBeLessThan(callOrder.indexOf('transitionOut'));
      expect(callOrder.indexOf('transitionOut')).toBeLessThan(unmountIdx);
    }

    expect(outlet.children).toHaveLength(1);
    expect(queryRouteView(outlet, 'to')).not.toBeNull();
  });
});

jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../_helpers/jest/mock-hooks-registry').mockHooksRegistry());

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import type { RouteNode } from '../../core/route-tree/route-node.types';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
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
import { createTestOutlet } from '../_helpers/jest/navigation-fixtures';
import {
  loadViewFromParamId,
  wireRouteViewController as wireRouteView,
} from '../_helpers/wire-route-view-controller';

function wireRouteViewController(
  node: RouteNode,
  outlet: AuraOutlet,
  resolve: (id: string) => string,
  cacheDom = false,
) {
  return wireRouteView({
    route: node.route,
    path: node.pattern,
    outlet,
    loadView: loadViewFromParamId(resolve),
    cacheDom,
  });
}

async function runParamRemountNavigation(
  from: MatchedRouteInfo,
  to: MatchedRouteInfo,
  loadView: ViewGraph['loadView'],
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

describe('param-change remount integration (branch commit)', () => {
  setupViewIntegrationTests();

  it('keeps enter view on screen through prepare > commit > unmount', async () => {
    const outlet = createTestOutlet();
    let serial = 0;
    const node = createUsersIdNode({
      view: { loader: 'url', content: 'content/user/:id.html' },
    });
    const { loadView } = wireRouteViewController(
      node,
      outlet,
      () => `<span>view-${++serial}</span>`,
    );

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.resolveAndMountView(from);
    expect(outlet.textContent).toBe('view-1');

    const { result, transaction } = await runParamRemountNavigation(from, to, loadView);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.paramChangeRemount).toBe(true);
    expect(serial).toBe(2);
    expect(outlet.textContent).toBe('view-2');
    expect(outlet.children).toHaveLength(1);
  });

  it('round-trip with cache.dom restores exit DOM on commit (tryCacheRestore)', async () => {
    const outlet = createTestOutlet();
    let serial = 0;
    const node = createUsersIdNode({
      cache: { dom: true, view: false, data: false },
      view: { loader: 'url', content: 'content/user/:id.html' },
    });

    const { stash, loadView } = wireRouteViewController(
      node,
      outlet,
      () => `<span>view-${++serial}</span>`,
      true,
    );

    const from1 = createUsersIdMatch('1', node);
    const to2 = createUsersIdMatch('2', node);
    const back1 = createUsersIdMatch('1', node);

    await from1.route.resolveAndMountView(from1);
    expect(outlet.textContent).toBe('view-1');

    await runParamRemountNavigation(from1, to2, loadView);
    expect(outlet.textContent).toBe('view-2');
    expect(stash.has('/users/1')).toBe(true);

    await runParamRemountNavigation(to2, back1, loadView);
    // prepare may still call loadView (ViewGraph); mount reuses DomCache root
    expect(serial).toBe(3);
    expect(outlet.textContent).toBe('view-1');
  });
});

describe('NavigationTransactionPipeline branch remount options', () => {
  setupViewIntegrationTests({ resetHooks: true });

  it('passes paramChangeRemount to mountResolvedView via branch mount', async () => {
    const mountResolvedView = jest.fn().mockReturnValue({ status: 'ok' });
    const node = createUsersIdNode({
      view: { loader: 'url', content: 'content/user/:id.html' },
    });
    const exitRoute = createUsersIdMatch('1', node);
    const enterRoute = createUsersIdMatch('2', node);
    enterRoute.route.mountResolvedView = mountResolvedView;

    const engine = createMockEngine();
    (engine.viewGraph!.loadView as jest.Mock).mockResolvedValue({ payload: '<span>view-2</span>' });

    const transaction = createNavigationTransaction({
      engine,
      from: exitRoute,
      to: enterRoute,
      plan: buildTransitionPlan(exitRoute, enterRoute),
    });

    const pipeline = new NavigationTransactionPipeline(transaction);
    expect(await pipeline.runLoads()).toBeNull();
    expect(await pipeline.runRender()).toBeNull();

    expect(mountResolvedView).toHaveBeenCalledTimes(1);
    expect(mountResolvedView).toHaveBeenCalledWith(
      enterRoute,
      expect.objectContaining({
        parentSignal: transaction.signal,
        paramChangeRemount: true,
        preResolvedView: '<span>view-2</span>',
      }),
    );
  });
});

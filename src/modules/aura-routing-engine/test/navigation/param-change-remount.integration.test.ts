jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree/route-node.types';
import type { ViewGraph } from '../../core/view-graph';
import { RouteViewController } from '../../../aura-route/core/view/view-controller';
import { domCacheKey } from '../../../aura-route/core/view/dom-cache';
import { NO_TRANSITION } from '../../../aura-route/core/attr/transition-attr-parser';
import type { CacheFlags } from '../../../aura-route/core/attr/cache-attr-parser';
import type { RouteLifecycleContext } from '../../core/route/types';
import {
  createUsersIdMatch,
  createUsersIdNode,
} from '../helpers/create-dynamic-leaf-match';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
import { createMockEngine } from '../helpers/create-mock-transaction';
import { createTestOutlet } from '../helpers/jest/navigation-fixtures';
import { resetHookMocks } from '../helpers/jest/hook-mocks';

function wireRouteViewController(
  node: RouteNode,
  outlet: AuraOutlet,
  resolve: (id: string) => string,
  cacheDom = false,
): { controller: RouteViewController; stash: Map<string, Element>; loadView: ViewGraph['loadView'] } {
  let passId = 0;
  const stash = new Map<string, Element>();
  const routeRecord = node.route as {
    path: string;
    layout: string;
    view: unknown;
    loadingTemplate: string;
    errorTemplate: string;
    scrollPolicy: null;
    cache: CacheFlags;
    transition: typeof NO_TRANSITION;
    render: RouteViewController['render'];
    applyPreResolved: RouteViewController['applyPreResolved'];
    onUnmount: (ctx: RouteLifecycleContext) => void;
    commitStagedView: () => void;
  };

  routeRecord.path = node.pattern;
  routeRecord.layout = '';
  routeRecord.view = routeRecord.view ?? null;
  routeRecord.loadingTemplate = routeRecord.loadingTemplate ?? '';
  routeRecord.errorTemplate = routeRecord.errorTemplate ?? '';
  routeRecord.scrollPolicy = null;
  routeRecord.cache = { dom: cacheDom, view: false, data: false };
  routeRecord.transition = NO_TRANSITION;

  const loadView: ViewGraph['loadView'] = async (info) => ({ data: resolve(info.params?.id ?? '?') });

  const controller = new RouteViewController(
    {
      route: routeRecord,
      view: { loadView },
      cache: {
        extract: (key) => {
          const root = stash.get(key);
          if (root) stash.delete(key);
          return root;
        },
        put: (key, root) => stash.set(key, root),
      },
      mountTarget: {
        appOutlet: () => outlet,
        nestedOutlet: () => null,
      },
    },
    () => passId,
  );

  routeRecord.render = (info, options) => controller.render(info, options);
  routeRecord.applyPreResolved = (info, options) => controller.applyPreResolved(info, options);
  routeRecord.onUnmount = (ctx) => {
    passId++;
    controller.onUnmount({ domCacheKey: domCacheKey(ctx.to, routeRecord.path) });
  };
  routeRecord.commitStagedView = () => controller.commitStagedView();

  return { controller, stash, loadView };
}

async function runParamRemountNavigation(
  from: MatchedRouteInfo,
  to: MatchedRouteInfo,
  loadView: ViewGraph['loadView'],
) {
  const engine = createMockEngine();
  engine.viewGraph = { loadView } as unknown as ViewGraph;

  const transaction = new NavigationTransaction(
    1,
    0,
    {
      from,
      to,
      action: 'push',
      href: to.href,
      hash: '',
      options: { replace: false, syncHistory: true },
    },
    () => false,
    engine,
  );

  return {
    result: await transaction.run(),
    transaction,
  };
}

describe('param-change remount integration (branch commit)', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetHookMocks();
    document.body.replaceChildren();
  });

  it('keeps enter view on screen through prepare → commit → unmount', async () => {
    const outlet = createTestOutlet();
    let serial = 0;
    const node = createUsersIdNode({
      view: { loader: 'url', content: 'content/user/{{id}}.html' },
    });
    const { loadView } = wireRouteViewController(
      node,
      outlet,
      () => `<span>view-${++serial}</span>`,
    );

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
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
      view: { loader: 'url', content: 'content/user/{{id}}.html' },
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

    await from1.route.render(from1);
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
  beforeEach(() => {
    jest.clearAllMocks();
    resetHookMocks();
  });

  it('passes paramChangeRemount to applyPreResolved via branch mount', async () => {
    const applyPreResolved = jest.fn().mockReturnValue({ status: 'ok' });
    const node = createUsersIdNode({
      view: { loader: 'url', content: 'content/user/{{id}}.html' },
    });
    const exitRoute = createUsersIdMatch('1', node);
    const enterRoute = createUsersIdMatch('2', node);
    enterRoute.route.applyPreResolved = applyPreResolved;

    const engine = createMockEngine();
    (engine.viewGraph!.loadView as jest.Mock).mockResolvedValue({ data: '<span>view-2</span>' });

    const transaction = new NavigationTransaction(
      1,
      0,
      {
        from: exitRoute,
        to: enterRoute,
        action: 'push',
        href: enterRoute.href,
        hash: '',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );
    transaction.transitionPlan = buildTransitionPlan(exitRoute, enterRoute);

    const pipeline = new NavigationTransactionPipeline(transaction);
    expect(await pipeline.runPrepare()).toBeNull();
    expect(await pipeline.runRender()).toBeNull();

    expect(applyPreResolved).toHaveBeenCalledTimes(1);
    expect(applyPreResolved).toHaveBeenCalledWith(
      enterRoute,
      expect.objectContaining({
        parentSignal: transaction.signal,
        paramChangeRemount: true,
        preResolvedContent: '<span>view-2</span>',
      }),
    );
  });
});

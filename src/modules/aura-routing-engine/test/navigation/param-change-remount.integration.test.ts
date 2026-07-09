jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree/route-node.types';
import { RouteViewController } from '../../../aura-route/core/view/view-controller';
import { cacheKey } from '../../../aura-route/core/view/view-cache';
import { NO_TRANSITION } from '../../../aura-route/core/attr/transition-attr-parser';
import type { RouteLifecycleContext } from '../../core/route/types';
import {
  createUsersIdMatch,
  createUsersIdNode,
} from '../helpers/create-dynamic-leaf-match';
import { buildTransitionPlan } from '../../core/route-tree/transition-plan';
import { createMockEngine } from '../helpers/create-mock-transaction';
import { createTestOutlet } from '../helpers/jest/navigation-fixtures';
import { mockRunPhaseHooks, resetHookMocks } from '../helpers/jest/hook-mocks';

function wireRouteViewController(
  node: RouteNode,
  outlet: AuraOutlet,
  resolve: () => string,
  preserveView = false,
): { controller: RouteViewController; stash: Map<string, Element> } {
  let passId = 0;
  const stash = new Map<string, Element>();
  const routeRecord = node.route as {
    path: string;
    layout: string;
    view: unknown;
    loadingTemplate: string;
    errorTemplate: string;
    scrollPolicy: null;
    preserve: { view: boolean; data: boolean };
    transition: typeof NO_TRANSITION;
    render: RouteViewController['render'];
    onUnmount: (ctx: RouteLifecycleContext) => void;
    commitStagedView: () => void;
  };

  routeRecord.path = node.pattern;
  routeRecord.layout = '';
  routeRecord.view = routeRecord.view ?? null;
  routeRecord.loadingTemplate = routeRecord.loadingTemplate ?? '';
  routeRecord.errorTemplate = routeRecord.errorTemplate ?? '';
  routeRecord.scrollPolicy = null;
  routeRecord.preserve = { view: preserveView, data: false };
  routeRecord.transition = NO_TRANSITION;

  const controller = new RouteViewController(
    {
      route: routeRecord,
      view: { loadView: async () => resolve() },
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
  routeRecord.onUnmount = (ctx) => {
    passId++;
    controller.onUnmount({ cacheKey: cacheKey(ctx.to, routeRecord.path) });
  };
  routeRecord.commitStagedView = () => controller.commitStagedView();

  return { controller, stash };
}

async function runParamRemountNavigation(from: MatchedRouteInfo, to: MatchedRouteInfo) {
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
    createMockEngine(),
  );

  return {
    result: await transaction.run(),
    transaction,
  };
}

describe('param-change remount integration (real runViewCommit)', () => {
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

  it('keeps enter view on screen through render → commit → unmount', async () => {
    const outlet = createTestOutlet();
    let serial = 0;
    const node = createUsersIdNode({
      view: { type: 'url', content: 'content/user/{{id}}.html' },
    });
    wireRouteViewController(node, outlet, () => `<span>view-${++serial}</span>`);

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
    expect(outlet.textContent).toBe('view-1');

    const { result, transaction } = await runParamRemountNavigation(from, to);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.paramChangeRemount).toBe(true);
    expect(serial).toBe(2);
    expect(outlet.textContent).toBe('view-2');
    expect(outlet.children).toHaveLength(1);
  });

  it('round-trip with preserve.view caches exit DOM under pathname key', async () => {
    const outlet = createTestOutlet();
    let serial = 0;
    const node = createUsersIdNode({
      preserve: { view: true, data: false },
      view: { type: 'url', content: 'content/user/{{id}}.html' },
    });

    const { stash } = wireRouteViewController(
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

    await runParamRemountNavigation(from1, to2);
    expect(outlet.textContent).toBe('view-2');
    expect(stash.has('/users/1')).toBe(true);

    await runParamRemountNavigation(to2, back1);
    expect(serial).toBe(2);
    expect(outlet.textContent).toBe('view-1');
  });
});

describe('NavigationTransactionPipeline viewCommitOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHookMocks();
  });

  it('passes paramChangeRemount to route.render via real runViewCommit', async () => {
    const render = jest.fn().mockResolvedValue({ status: 'ok' });
    const node = createUsersIdNode({
      view: { type: 'url', content: 'content/user/{{id}}.html' },
    });
    const exitRoute = createUsersIdMatch('1', node);
    const enterRoute = createUsersIdMatch('2', node);
    enterRoute.route.render = render;

    const engine = createMockEngine();
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

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(
      enterRoute,
      expect.objectContaining({
        parentSignal: transaction.signal,
        paramChangeRemount: true,
      }),
    );
  });
});

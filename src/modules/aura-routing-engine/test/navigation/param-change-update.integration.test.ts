import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { runPhaseHooks } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree/route-node.types';
import { RouteViewController } from '../../../aura-route/core/view2/view-controller';
import { NO_TRANSITION } from '../../../aura-route/core/attr/transition-attr-parser';
import {
  createUsersIdMatch,
  createUsersIdNode,
} from '../helpers/create-dynamic-leaf-match';
import { createMockEngine } from '../helpers/create-mock-transaction';

jest.mock('../../core/hooks/registry', () => ({
  ...jest.requireActual('../../core/hooks/registry'),
  runPhaseHooks: jest.fn(),
}));

const mockRunPhaseHooks = runPhaseHooks as jest.MockedFunction<typeof runPhaseHooks>;

function createOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

function wireRouteViewController(
  node: RouteNode,
  outlet: AuraOutlet,
  resolve: () => string,
): { resolveCount: () => number } {
  let passId = 0;
  let resolveCount = 0;
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
    commitStagedView: () => void;
  };

  routeRecord.path = node.pattern;
  routeRecord.layout = '';
  routeRecord.view = routeRecord.view ?? null;
  routeRecord.loadingTemplate = routeRecord.loadingTemplate ?? '';
  routeRecord.errorTemplate = routeRecord.errorTemplate ?? '';
  routeRecord.scrollPolicy = null;
  routeRecord.preserve = { view: false, data: false };
  routeRecord.transition = NO_TRANSITION;

  const controller = new RouteViewController(
    {
      route: routeRecord,
      content: { resolve: async () => { resolveCount++; return resolve(); } },
      cache: { extract: () => undefined, put: () => {} },
      mountTarget: {
        appOutlet: () => outlet,
        nestedOutlet: () => null,
      },
    },
    () => passId,
  );

  routeRecord.render = (info, options) => controller.render(info, options);
  routeRecord.commitStagedView = () => controller.commitStagedView();

  return { resolveCount: () => resolveCount };
}

async function runParamUpdateNavigation(from: MatchedRouteInfo, to: MatchedRouteInfo) {
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

describe('param-change UPDATE integration (real view)', () => {
  beforeAll(() => {
    if (!customElements.get(AuraOutlet.is)) {
      customElements.define(AuraOutlet.is, AuraOutlet);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
    document.body.replaceChildren();
  });

  it('same viewKey keeps DOM and skips re-render on /users/1 → /users/2', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const outlet = createOutlet();
    const node = createUsersIdNode({
      view: { type: 'html-src', content: 'partials/user-shell.html' },
      update: ['apply-user'],
      unmount: ['teardown'],
      ready: ['analytics'],
    });
    const { resolveCount } = wireRouteViewController(
      node,
      outlet,
      () => '<article id="user-shell">User profile shell</article>',
    );

    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    await from.route.render(from);
    expect(outlet.textContent).toBe('User profile shell');
    expect(resolveCount()).toBe(1);
    const shellBefore = outlet.querySelector('#user-shell');
    expect(shellBefore).not.toBeNull();

    const { result, transaction } = await runParamUpdateNavigation(from, to);

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(transaction.transitionPlan.update).toBe(true);
    expect(resolveCount()).toBe(1);
    expect(outlet.textContent).toBe('User profile shell');
    const shellAfter = outlet.querySelector('#user-shell');
    expect(shellAfter).toBe(shellBefore);
    expect(phases).toEqual(['update']);
    expect(phases).not.toContain('unmount');
    expect(phases).not.toContain('remount');
    expect(phases).not.toContain('ready');
  });
});

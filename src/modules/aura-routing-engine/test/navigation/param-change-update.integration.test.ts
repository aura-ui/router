jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../_helpers/jest/mock-hooks-registry').mockHooksRegistry());

import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import {
  createUsersIdMatch,
  createUsersIdNode,
} from '../_helpers/create-dynamic-leaf-match';
import { createMockEngine, createNavigationTransaction } from '../_helpers/create-mock-transaction';
import { setupViewIntegrationTests } from '../_helpers/integration-setup';
import { mockRunPhaseHooks } from '../_helpers/jest/hook-mocks';
import { createTestOutlet } from '../_helpers/jest/navigation-fixtures';
import { wireRouteViewController as wireRouteView } from '../_helpers/wire-route-view-controller';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree/route-node.types';

function wireRouteViewController(
  node: RouteNode,
  outlet: AuraOutlet,
  resolve: () => string,
): { resolveCount: () => number } {
  let resolveCount = 0;
  wireRouteView({
    route: node.route,
    path: node.pattern,
    outlet,
    cache: NO_CACHE,
    wireUnmount: false,
    wireMountResolvedView: false,
    loadView: async () => {
      resolveCount++;
      return { payload: resolve() };
    },
  });
  return { resolveCount: () => resolveCount };
}

async function runParamUpdateNavigation(from: MatchedRouteInfo, to: MatchedRouteInfo) {
  const transaction = createNavigationTransaction({
    engine: createMockEngine(),
    from,
    to,
  });

  return {
    result: await transaction.run(),
    transaction,
  };
}

describe('param-change UPDATE integration (real view)', () => {
  setupViewIntegrationTests();

  it('same viewKey keeps DOM and skips re-render on /users/1 > /users/2', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const outlet = createTestOutlet();
    const node = createUsersIdNode({
      view: { loader: 'url', content: 'partials/user-shell.html' },
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

    await from.route.resolveAndMountView(from);
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

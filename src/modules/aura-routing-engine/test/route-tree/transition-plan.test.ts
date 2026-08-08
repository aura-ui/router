import { routeMatchKey } from '../../core/route-tree/matched-chain';
import {
  buildTransitionPlan,
  finalizeTransitionPlan,
  isSameNavigationTarget,
} from '../../core/route-tree/transition-plan';
import type { RouteInstance } from '../../core';
import { createUsersIdMatch, createUsersIdNode, createNestedUsersIdMatch, createNestedUsersIdSetup } from '../_helpers/create-dynamic-leaf-match';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';
import {
  createMatchedBranch,
  createNodeMatch,
  createTestRouteNode,
} from '../_helpers/route-tree-fixtures';

function chainFromPaths(paths: string[]) {
  return createMatchedBranch(paths).matches;
}

describe('buildTransitionPlan', () => {
  it('keeps flat A → B transition', () => {
    const from = createNodeMatch(createTestRouteNode('/a'));
    const to = createNodeMatch(createTestRouteNode('/b'));

    const plan = buildTransitionPlan(from, to);

    expect(plan.exitRoutes.map(routeMatchKey)).toEqual(['/a']);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/b']);
    expect(plan.lca).toBeNull();
    expect(plan.update).toBe(false);
  });

  it('builds sibling nested transition through shared parent LCA', () => {
    const fromChain = chainFromPaths(['/settings', '/settings/profile']);
    const toChain = chainFromPaths(['/settings', '/settings/security']);

    const plan = buildTransitionPlan(fromChain[1]!, toChain[1]!);

    expect(plan.exitRoutes.map(routeMatchKey)).toEqual(['/settings/profile']);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/settings/security']);
    expect(routeMatchKey(plan.lca!)).toBe('/settings');
  });

  it('cold enter activates full branch', () => {
    const toChain = chainFromPaths(['/settings', '/settings/profile']);
    const plan = buildTransitionPlan(null, toChain[1]!);

    expect(plan.exitRoutes).toEqual([]);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/settings', '/settings/profile']);
  });

  it('branch exit deactivates leaf to root', () => {
    const fromChain = chainFromPaths(['/settings', '/settings/profile']);
    const to = createNodeMatch(createTestRouteNode('/'));

    const plan = buildTransitionPlan(fromChain[1]!, to);

    expect(plan.exitRoutes.map(routeMatchKey)).toEqual(['/settings/profile', '/settings']);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/']);
  });

  it('update shortcut when pathname and search match same leaf', () => {
    const from = chainFromPaths(['/settings', '/settings/profile'])[1]!;
    const to = { ...from, query: { tab: '1' } };

    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(true);
    expect(plan.exitRoutes).toEqual([]);
    expect(plan.enterRoutes).toHaveLength(1);
    expect(routeMatchKey(plan.enterRoutes[0]!)).toBe('/settings/profile');
  });

  it('update shortcut when pathname matches same leaf and search changes', () => {
    const from = chainFromPaths(['/settings', '/settings/profile'])[1]!;
    const to = {
      ...from,
      href: '/settings/profile?tab=2',
      search: '?tab=2',
      query: { tab: '2' },
    };

    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(true);
    expect(isSameNavigationTarget(from, to)).toBe(false);
  });

  it('update shortcut when dynamic params change on the same leaf node and view key', () => {
    const node = createUsersIdNode({
      view: { loader: 'import', content: 'user-profile' },
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const plan = buildTransitionPlan(from, to);

    expect(isSameNavigationTarget(from, to)).toBe(false);
    expect(plan.update).toBe(true);
    expect(plan.exitRoutes).toEqual([]);
    expect(plan.enterRoutes).toHaveLength(1);
    expect(plan.enterRoutes[0]!.params).toEqual({ id: '2' });
    expect(routeMatchKey(plan.enterRoutes[0]!)).toBe('/users/:id');
  });

  it('synthetic remount when per-id view content changes on the same leaf node', () => {
    const node = createUsersIdNode({
      view: { loader: 'url', content: 'content/user/:id.html' },
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(false);
    expect(plan.paramChangeRemount).toBe(true);
    expect(plan.exitRoutes).toHaveLength(1);
    expect(plan.enterRoutes).toHaveLength(1);
    expect(plan.enterRoutes[0]!.params).toEqual({ id: '2' });
    expect(plan.lca).toBeNull();
  });

  it('synthetic remount on flat leaf when param-change is navigate', () => {
    const node = createUsersIdNode({
      paramChange: 'navigate',
      view: { loader: 'url', content: 'partials/user-shell.html' },
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(false);
    expect(plan.paramChangeRemount).toBe(true);
    expect(plan.exitRoutes.map(routeMatchKey)).toEqual(['/users/:id']);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/users/:id']);
    expect(plan.lca).toBeNull();
  });

  it('update shortcut when param-change is update despite per-id view content', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const node = createUsersIdNode({
      paramChange: 'update',
      view: { loader: 'url', content: 'content/user/:id.html' },
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    expect(buildTransitionPlan(from, to).update).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('stale HTML risk'),
    );
    warnSpy.mockRestore();
  });

  it('keeps layout parent as lca on synthetic param remount', () => {
    const { leaf } = createNestedUsersIdSetup({
      view: { loader: 'url', content: 'content/user/:id.html' },
    });
    const from = createNestedUsersIdMatch('1', leaf);
    const to = createNestedUsersIdMatch('2', leaf);

    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(false);
    expect(plan.lca?.pattern).toBe('/users');
    expect(plan.exitRoutes).toHaveLength(1);
    expect(routeMatchKey(plan.exitRoutes[0]!)).toBe('/users/:id');
  });

  describe('param-change policy by view loader', () => {
    it.each([
      ['html', 'partials/user-shell.html', true],
      ['html', 'content/user/:id.html', false],
      ['url', 'partials/user-shell.html', true],
      ['url', 'content/user/:id.html', false],
      ['component', 'user-profile', true],
      ['component', 'user-:id', false],
      ['import', 'user-profile', true],
      ['import', 'widgets/user-:id', false],
      ['template', 'app-shell', true],
      ['template', 'shells/user-:id', false],
    ] as const)(
      '%s with %s → update=%s',
      (loader, content, expectUpdate) => {
        const node = createUsersIdNode({ view: { loader, content } });
        const from = createUsersIdMatch('1', node);
        const to = createUsersIdMatch('2', node);

        if (expectUpdate) {
          expect(from.resolvedView?.viewKey).toBe(to.resolvedView?.viewKey);
        } else {
          expect(from.resolvedView?.viewKey).not.toBe(to.resolvedView?.viewKey);
        }

        expect(buildTransitionPlan(from, to).update).toBe(expectUpdate);
      },
    );

    it('layout-only leaf (resolvedView null) → update on param change', () => {
      const node = createUsersIdNode({
        layout: 'users-shell',
        view: { loader: 'url', content: 'ignored.html' },
      } as Partial<RouteInstance>);
      const from = createUsersIdMatch('1', node);
      const to = createUsersIdMatch('2', node);

      expect(from.resolvedView).toBeNull();
      expect(to.resolvedView).toBeNull();

      const plan = buildTransitionPlan(from, to);

      expect(plan.update).toBe(true);
      expect(plan.exitRoutes).toEqual([]);
    });

    it('unresolved :placeholder keeps same viewKey → update (misconfiguration)', () => {
      const node = createUsersIdNode({
        view: { loader: 'url', content: 'content/:missing.html' },
      });
      const from = createUsersIdMatch('1', node);
      const to = createUsersIdMatch('2', node);

      expect(from.resolvedView?.viewKey).toBe(to.resolvedView?.viewKey);
      expect(buildTransitionPlan(from, to).update).toBe(true);
    });
  });
});

describe('isSameNavigationTarget', () => {
  it('distinguishes query change from exact same URL', () => {
    const from = chainFromPaths(['/users'])[0]!;
    const toSame = { ...from };
    const toQuery = {
      ...from,
      href: '/users?page=2',
      search: '?page=2',
      query: { page: '2' },
    };

    expect(isSameNavigationTarget(from, toQuery)).toBe(false);
    expect(isSameNavigationTarget(from, toSame)).toBe(true);
  });

  it('treats trailing slash as same navigation target', () => {
    const from = createMatchedRoute('/app/settings');
    const to = createMatchedRoute('/app/settings/');
    to.node = from.node;
    to.pattern = from.pattern;
    to.route = from.route;

    expect(isSameNavigationTarget(from, to)).toBe(true);
  });
});

describe('derived TransitionMap fields', () => {
  it('fills enterMatch / exitMatch and leaf routes', () => {
    const chain = chainFromPaths(['/settings', '/settings/profile']);
    const plan = buildTransitionPlan(null, chain[1]!);

    expect(plan.enterMatch).toBe(chain[1]!);
    expect(plan.enterRoute).toBe(chain[1]!.route);
    expect(plan.exitMatch).toBeUndefined();
    expect(plan.exitRoute).toBeUndefined();
    expect(plan.transitionOrder).toBeNull();
  });

  it('fills exitMatch as leaving leaf', () => {
    const chain = chainFromPaths(['/settings', '/settings/profile']);
    const profile = chain[1]!;
    const about = chainFromPaths(['/about'])[0]!;
    const plan = buildTransitionPlan(profile, about);

    expect(plan.exitMatch).toBe(profile);
    expect(plan.exitRoute).toBe(profile.route);
    expect(plan.enterMatch).toBe(about);
  });

  it('finalizeTransitionPlan handles empty branches', () => {
    const plan = finalizeTransitionPlan({ exitRoutes: [], enterRoutes: [], lca: null, update: false });

    expect(plan.enterMatch).toBeUndefined();
    expect(plan.exitMatch).toBeUndefined();
    expect(plan.needsBlockingWalk).toBe(false);
    expect(plan.isFlatSingleEnter).toBe(false);
    expect(plan.canUseFastPath).toBe(false);
    expect(plan.transitionOrder).toBeNull();
  });
});

describe('needsBlockingWalk field', () => {
  it('is true when an exit route has leave', () => {
    const exit = createMatchedRoute('/a', { leave: ['on-leave'] });
    const plan = finalizeTransitionPlan({
      exitRoutes: [exit],
      enterRoutes: [createMatchedRoute('/b')],
      lca: null,
      update: false,
    });

    expect(plan.hasExitLeave).toBe(true);
    expect(plan.hasEnterGuard).toBe(false);
    expect(plan.needsBlockingWalk).toBe(true);
  });

  it('is true when an enter route has guard', () => {
    const enter = createMatchedRoute('/b', { guard: ['on-guard'] });
    const plan = finalizeTransitionPlan({
      exitRoutes: [createMatchedRoute('/a')],
      enterRoutes: [enter],
      lca: null,
      update: false,
    });

    expect(plan.hasExitLeave).toBe(false);
    expect(plan.hasEnterGuard).toBe(true);
    expect(plan.needsBlockingWalk).toBe(true);
  });

  it('is false when exit/enter have no leave or guard', () => {
    const plan = finalizeTransitionPlan({
      exitRoutes: [createMatchedRoute('/a')],
      enterRoutes: [createMatchedRoute('/b')],
      lca: null,
      update: false,
    });

    expect(plan.needsBlockingWalk).toBe(false);
  });
});

describe('isFlatSingleEnter / canUseFastPath fields', () => {
  it('accepts one enter and at most one exit', () => {
    const plan = finalizeTransitionPlan({
      exitRoutes: [createMatchedRoute('/a')],
      enterRoutes: [createMatchedRoute('/b')],
      lca: null,
      update: false,
    });

    expect(plan.isFlatSingleEnter).toBe(true);
    expect(plan.canUseFastPath).toBe(true);
  });

  it('rejects update, remount, and multi-enter/exit shapes', () => {
    expect(
      finalizeTransitionPlan({
        exitRoutes: [],
        enterRoutes: [createMatchedRoute('/a')],
        lca: createMatchedRoute('/a'),
        update: true,
      }).isFlatSingleEnter,
    ).toBe(false);

    expect(
      finalizeTransitionPlan({
        exitRoutes: [createMatchedRoute('/users/1')],
        enterRoutes: [createMatchedRoute('/users/2')],
        lca: null,
        update: false,
        paramChangeRemount: true,
      }).isFlatSingleEnter,
    ).toBe(false);

    expect(
      finalizeTransitionPlan({
        exitRoutes: [createMatchedRoute('/a'), createMatchedRoute('/b')],
        enterRoutes: [createMatchedRoute('/c')],
        lca: null,
        update: false,
      }).isFlatSingleEnter,
    ).toBe(false);
  });
});

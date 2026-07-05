import { createTestRoute } from '../helpers/create-test-route';
import {
  buildTransitionPlan,
  getEnterRoute,
  isSameNavigationTarget,
} from '../../core/route-tree/transition-plan';
import { buildMatchedChain, routeMatchKey } from '../../core/route-tree/matched-chain';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree/route-node.types';
import { createUsersIdMatch, createUsersIdNode, createNestedUsersIdMatch, createNestedUsersIdSetup } from '../helpers/create-dynamic-leaf-match';

function createMatch(node: RouteNode, pathname: string): MatchedRouteInfo {
  return {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: node.pattern,
    route: node.route,
    node,
  };
}

function chainFromPaths(paths: string[]): MatchedRouteInfo[] {
  const nodes = paths.map((pattern) => ({
    route: createTestRoute(pattern),
    content: { kind: 'content' as const, loader: '', ref: '', cache: false },
    segment: pattern,
    pattern,
    parent: null as RouteNode | null,
    children: [] as RouteNode[],
    depth: 0,
    isIndex: false,
    branch: [] as readonly RouteNode[],
  })) as RouteNode[];

  for (let i = 1; i < nodes.length; i++) {
    nodes[i]!.parent = nodes[i - 1]!;
    nodes[i - 1]!.children.push(nodes[i]!);
  }

  for (let i = 0; i < nodes.length; i++) {
    nodes[i]!.depth = i;
    nodes[i]!.branch = nodes.slice(0, i + 1);
  }

  return buildMatchedChain(nodes, (node) => createMatch(node, node.pattern));
}

describe('buildTransitionPlan', () => {
  it('keeps flat A → B transition', () => {
    const from = createMatch(
      {
        route: createTestRoute('/a'),
        segment: '/a',
        pattern: '/a',
        parent: null,
        children: [],
        depth: 0,
        isIndex: false,
        branch: [],
      },
      '/a',
    );
    const to = createMatch(
      {
        route: createTestRoute('/b'),
        segment: '/b',
        pattern: '/b',
        parent: null,
        children: [],
        depth: 0,
        isIndex: false,
        branch: [],
      },
      '/b',
    );

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
    const to = createMatch(
      {
        route: createTestRoute('/'),
        segment: '/',
        pattern: '/',
        parent: null,
        children: [],
        depth: 0,
        isIndex: false,
        branch: [],
      },
      '/',
    );

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
      view: { type: 'component-src', content: 'user-profile' },
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

  it('synthetic remount when per-id view ref changes on the same leaf node', () => {
    const node = createUsersIdNode({
      view: { type: 'html-src', content: 'content/user/{{id}}.html' },
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(false);
    expect(plan.exitRoutes).toHaveLength(1);
    expect(plan.enterRoutes).toHaveLength(1);
    expect(plan.enterRoutes[0]!.params).toEqual({ id: '2' });
    expect(plan.lca).toBeNull();
  });

  it('synthetic remount on flat leaf when param-change is navigate', () => {
    const node = createUsersIdNode({
      paramChange: 'navigate',
      view: { type: 'html-src', content: 'partials/user-shell.html' },
    });
    const from = createUsersIdMatch('1', node);
    const to = createUsersIdMatch('2', node);

    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(false);
    expect(plan.exitRoutes.map(routeMatchKey)).toEqual(['/users/:id']);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/users/:id']);
    expect(plan.lca).toBeNull();
  });

  it('update shortcut when param-change is update despite per-id view ref', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const node = createUsersIdNode({
      paramChange: 'update',
      view: { type: 'html-src', content: 'content/user/{{id}}.html' },
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
      view: { type: 'html-src', content: 'content/user/{{id}}.html' },
    });
    const from = createNestedUsersIdMatch('1', leaf);
    const to = createNestedUsersIdMatch('2', leaf);

    const plan = buildTransitionPlan(from, to);

    expect(plan.update).toBe(false);
    expect(plan.lca?.pattern).toBe('/users');
    expect(plan.exitRoutes).toHaveLength(1);
    expect(routeMatchKey(plan.exitRoutes[0]!)).toBe('/users/:id');
  });

  describe('param-change policy by view type', () => {
    it.each([
      ['html', 'partials/user-shell.html', true],
      ['html', 'content/user/{{id}}.html', false],
      ['html-src', 'partials/user-shell.html', true],
      ['html-src', 'content/user/{{id}}.html', false],
      ['component', 'user-profile', true],
      ['component', 'user-{{id}}', false],
      ['component-src', 'user-profile', true],
      ['component-src', 'widgets/user-{{id}}', false],
      ['template', 'app-shell', true],
      ['template', 'shells/user-{{id}}', false],
    ] as const)(
      '%s with %s → update=%s',
      (type, content, expectUpdate) => {
        const node = createUsersIdNode({ view: { type, content } });
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
        view: { type: 'html-src', content: 'ignored.html' },
      });
      const from = createUsersIdMatch('1', node);
      const to = createUsersIdMatch('2', node);

      expect(from.resolvedView).toBeNull();
      expect(to.resolvedView).toBeNull();

      const plan = buildTransitionPlan(from, to);

      expect(plan.update).toBe(true);
      expect(plan.exitRoutes).toEqual([]);
    });

    it('unresolved {{placeholder}} keeps same viewKey → update (misconfiguration)', () => {
      const node = createUsersIdNode({
        view: { type: 'html-src', content: 'content/{{missing}}.html' },
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
});

describe('getEnterRoute', () => {
  it('returns enter branch leaf route', () => {
    const chain = chainFromPaths(['/settings', '/settings/profile']);
    const plan = buildTransitionPlan(null, chain[1]!);

    expect(getEnterRoute(plan)).toBe(chain[1]!.route);
  });

  it('returns undefined for empty enter branch', () => {
    const plan = { exitRoutes: [], enterRoutes: [], lca: null, update: false };

    expect(getEnterRoute(plan)).toBeUndefined();
  });
});

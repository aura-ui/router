import { createTestRoute } from '../helpers/create-test-route';
import { buildTransitionPlan } from '../../core/transition/plan';
import { buildMatchedChain, routeMatchKey } from '../../core/route-tree/matched-chain';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree';

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
    expect(plan.reenter).toBe(false);
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

  it('reenter shortcut when pathname and search match same leaf', () => {
    const from = chainFromPaths(['/settings', '/settings/profile'])[1]!;
    const to = { ...from, query: { tab: '1' } };

    const plan = buildTransitionPlan(from, to);

    expect(plan.reenter).toBe(true);
    expect(plan.exitRoutes).toEqual([]);
    expect(plan.enterRoutes).toHaveLength(1);
    expect(routeMatchKey(plan.enterRoutes[0]!)).toBe('/settings/profile');
  });
});

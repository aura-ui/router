import { createTestRoute } from '../providers/create-test-route';
import { buildTreeRoadMap } from '../../core/nodes-tree/transition-plan';
import { buildMatchedChain, routeMatchKey } from '../../core/nodes-tree/matched-chain';
import type { MatchedRouteInfo } from '../../core/aura-routing-url-matcher';
import type { RouteNode } from '../../core/nodes-tree';

function createMatch(node: RouteNode, pathname: string): MatchedRouteInfo {
  return {
    url: pathname,
    pathname,
    search: '',
    hash: '',
    routePath: node.fullPath,
    route: node.route,
    node,
  };
}

function chainFromPaths(paths: string[]): MatchedRouteInfo[] {
  const nodes = paths.map((fullPath) => ({
    route: createTestRoute(fullPath),
    routePath: fullPath,
    fullPath,
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

  return buildMatchedChain(nodes, (node) => createMatch(node, node.fullPath));
}

describe('buildTreeRoadMap', () => {
  it('keeps flat A → B transition', () => {
    const from = createMatch(
      {
        route: createTestRoute('/a'),
        routePath: '/a',
        fullPath: '/a',
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
        routePath: '/b',
        fullPath: '/b',
        parent: null,
        children: [],
        depth: 0,
        isIndex: false,
        branch: [],
      },
      '/b',
    );

    const plan = buildTreeRoadMap(from, to);

    expect(plan.exitRoutes.map(routeMatchKey)).toEqual(['/a']);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/b']);
    expect(plan.lca).toBeNull();
    expect(plan.reenter).toBe(false);
  });

  it('builds sibling nested transition through shared parent LCA', () => {
    const fromChain = chainFromPaths(['/settings', '/settings/profile']);
    const toChain = chainFromPaths(['/settings', '/settings/security']);

    const plan = buildTreeRoadMap(fromChain[1]!, toChain[1]!);

    expect(plan.exitRoutes.map(routeMatchKey)).toEqual(['/settings/profile']);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/settings/security']);
    expect(routeMatchKey(plan.lca!)).toBe('/settings');
  });

  it('cold enter activates full branch', () => {
    const toChain = chainFromPaths(['/settings', '/settings/profile']);
    const plan = buildTreeRoadMap(null, toChain[1]!);

    expect(plan.exitRoutes).toEqual([]);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/settings', '/settings/profile']);
  });

  it('branch exit deactivates leaf to root', () => {
    const fromChain = chainFromPaths(['/settings', '/settings/profile']);
    const to = createMatch(
      {
        route: createTestRoute('/'),
        routePath: '/',
        fullPath: '/',
        parent: null,
        children: [],
        depth: 0,
        isIndex: false,
        branch: [],
      },
      '/',
    );

    const plan = buildTreeRoadMap(fromChain[1]!, to);

    expect(plan.exitRoutes.map(routeMatchKey)).toEqual(['/settings/profile', '/settings']);
    expect(plan.enterRoutes.map(routeMatchKey)).toEqual(['/']);
  });

  it('detects reenter navigation', () => {
    const chain = chainFromPaths(['/settings', '/settings/profile']);
    const from = chain[1]!;
    const to = { ...from };

    const plan = buildTreeRoadMap(from, to);

    expect(plan.reenter).toBe(true);
    expect(plan.exitRoutes).toEqual([]);
    expect(plan.enterRoutes).toEqual([chain[1]]);
  });
});

import { createTestRoute } from '../helpers/create-test-route';
import {
  buildExitRoutes,
  buildEnterRoutes,
  findBranchLcaIndex,
  findLcaNodes,
} from '../../core/route-tree/branch-diff';
import { buildMatchedChain } from '../../core/route-tree/matched-chain';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree';

function createMatch(node: RouteNode): MatchedRouteInfo {
  return {
    href: node.pattern,
    pathname: node.pattern,
    search: '',
    hash: '',
    pattern: node.pattern,
    route: node.route,
    node,
  };
}

function buildChain(patterns: string[]): MatchedRouteInfo[] {
  const nodes: RouteNode[] = patterns.map((pattern, depth) => ({
    route: createTestRoute(pattern),
    segment: pattern.split('/').pop() ?? pattern,
    pattern,
    parent: null,
    children: [],
    depth,
    isIndex: false,
    branch: [],
  }));

  for (let i = 1; i < nodes.length; i++) {
    nodes[i]!.parent = nodes[i - 1]!;
    nodes[i - 1]!.children.push(nodes[i]!);
  }

  for (let i = 0; i < nodes.length; i++) {
    nodes[i]!.depth = i;
    nodes[i]!.branch = nodes.slice(0, i + 1);
  }

  return buildMatchedChain(nodes, createMatch);
}

describe('branch-diff', () => {
  it('findBranchLcaIndex compares chains by shared prefix', () => {
    const from = buildChain(['/settings', '/settings/profile']);
    const to = buildChain(['/settings', '/settings/security']);

    expect(findBranchLcaIndex(from, to)).toBe(0);
    expect(buildExitRoutes(from, 0).map((info) => info.pattern)).toEqual(['/settings/profile']);
    expect(buildEnterRoutes(to, 0).map((info) => info.pattern)).toEqual(['/settings/security']);
  });

  it('findBranchLcaIndex returns -1 for unrelated branches', () => {
    const from = buildChain(['/settings', '/settings/profile']);
    const to = buildChain(['/']);

    expect(findBranchLcaIndex(from, to)).toBe(-1);
  });

  it('findLcaNodes walks parent pointers without allocations', () => {
    const chain = buildChain(['/settings', '/settings/profile', '/settings/profile/edit']);
    const settings = chain[0]!.node!;
    const profile = chain[1]!.node!;
    const edit = chain[2]!.node!;

    expect(findLcaNodes(profile, edit)).toBe(profile);
    expect(findLcaNodes(edit, profile)).toBe(profile);
    expect(findLcaNodes(settings, edit)).toBe(settings);
  });
});

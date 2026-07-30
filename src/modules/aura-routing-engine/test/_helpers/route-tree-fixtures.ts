import type { RouteInstance } from '../../core';
import { computeMatchScore } from '../../core/match/route-score';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { buildMatchedChain } from '../../core/route-tree/matched-chain';
import type { RouteNode } from '../../core/route-tree/route-node.types';

import { createMatchedRoute, type CreateMatchedRouteOverrides } from './create-mock-transaction';
import { createTestRoute } from './create-test-route';

export type CreateTestRouteNodeOptions = {
  route?: Partial<RouteInstance>;
  segment?: string;
  parent?: RouteNode | null;
  depth?: number;
  isIndex?: boolean;
};

/** Minimal {@link RouteNode} for hand-built trees (parent/children/branch wiring optional). */
export function createTestRouteNode(
  pattern: string,
  options: CreateTestRouteNodeOptions = {},
): RouteNode {
  const parent = options.parent ?? null;
  const depth = options.depth ?? (parent ? parent.depth + 1 : 0);
  const node = {
    route: createTestRoute(pattern, options.route) as RouteNode['route'],
    segment: options.segment ?? pattern.split('/').filter(Boolean).pop() ?? pattern,
    pattern,
    matchScore: computeMatchScore(pattern),
    parent,
    children: [] as RouteNode[],
    depth,
    isIndex: options.isIndex ?? false,
    branch: [] as readonly RouteNode[],
  } as RouteNode;

  if (parent) {
    parent.children.push(node);
  }
  node.branch = parent ? [...parent.branch, node] : [node];
  return node;
}

/** Link `nodes` into a linear parent→child branch and refresh depth/branch. */
export function linkRouteNodeBranch(nodes: RouteNode[]): RouteNode[] {
  if (nodes.length === 0) return nodes;

  nodes[0]!.parent = null;
  nodes[0]!.children = [];
  for (let i = 1; i < nodes.length; i++) {
    nodes[i]!.parent = nodes[i - 1]!;
    nodes[i - 1]!.children = [nodes[i]!];
    nodes[i]!.children = [];
  }
  for (let i = 0; i < nodes.length; i++) {
    nodes[i]!.depth = i;
    nodes[i]!.branch = nodes.slice(0, i + 1);
  }
  return nodes;
}

export type CreateNodeMatchOptions = Omit<CreateMatchedRouteOverrides, 'node' | 'asRoute'>;

/** Match fixture bound to an existing {@link RouteNode}. */
export function createNodeMatch(
  node: RouteNode,
  pathname: string = node.pattern,
  overrides: CreateNodeMatchOptions = {},
): MatchedRouteInfo {
  const { pathname: pathnameOverride, href, pattern, ...rest } = overrides;
  const path = pathnameOverride ?? pathname;
  return createMatchedRoute(path, {
    ...rest,
    asRoute: node.route,
    pattern: pattern ?? node.pattern,
    href: href ?? path,
    pathname: path,
    node,
  });
}

export type MatchedBranch = {
  nodes: RouteNode[];
  matches: MatchedRouteInfo[];
  leaf: MatchedRouteInfo;
};

/**
 * Build a linear matched branch from path patterns.
 * @example createMatchedBranch(['/settings', '/settings/profile'])
 */
export function createMatchedBranch(
  patterns: string[],
  routeOverrides: Array<Partial<RouteInstance> | undefined> = [],
): MatchedBranch {
  const nodes = linkRouteNodeBranch(
    patterns.map((pattern, index) =>
      createTestRouteNode(pattern, { route: routeOverrides[index], depth: index }),
    ),
  );

  const matches = buildMatchedChain(nodes, (node) => createNodeMatch(node));

  return {
    nodes,
    matches,
    leaf: matches[matches.length - 1]!,
  };
}

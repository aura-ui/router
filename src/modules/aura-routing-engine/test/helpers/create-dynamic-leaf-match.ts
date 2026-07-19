import type { RouteInstance } from '../../core';
import { resourceKeys } from '../../core/match/resource-keys';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { computeMatchScore } from '../../core/match/route-score';
import type { RouteNode } from '../../core/route-tree/route-node.types';
import { createTestRoute } from './create-test-route';
import { withResolvedView } from './with-resolved-view';

function withResourceKeys(info: MatchedRouteInfo): MatchedRouteInfo {
  const keys = resourceKeys(info);
  info.dataKey = keys.dataKey;
  info.viewKey = keys.viewKey;
  return info;
}

export const USERS_LAYOUT_PATTERN = '/users';
export const USERS_ID_PATTERN = '/users/:id';

export function createUsersLayoutNode(): RouteNode {
  const node = {
    route: createTestRoute(USERS_LAYOUT_PATTERN, { layout: 'users-shell' }),
    content: { kind: 'view' as const, loader: '', content: '', cache: false },
    segment: USERS_LAYOUT_PATTERN,
    pattern: USERS_LAYOUT_PATTERN,
    matchScore: computeMatchScore(USERS_LAYOUT_PATTERN),
    parent: null,
    children: [] as RouteNode[],
    depth: 0,
    isIndex: false,
    branch: [] as readonly RouteNode[],
  } as RouteNode;
  node.branch = [node];
  return node;
}

export function createNestedUsersIdSetup(leafOverrides: Partial<RouteInstance> = {}): {
  parent: RouteNode;
  leaf: RouteNode;
} {
  const parent = createUsersLayoutNode();
  const leaf = createUsersIdNode(leafOverrides);
  leaf.parent = parent;
  leaf.depth = 1;
  parent.children = [leaf];
  parent.branch = [parent, leaf];
  leaf.branch = [parent, leaf];
  return { parent, leaf };
}

export function createNestedUsersIdMatch(id: string, leaf: RouteNode): MatchedRouteInfo {
  const parent = leaf.parent!;
  const pathname = `/users/${id}`;
  const chain: MatchedRouteInfo[] = [parent, leaf].map((node, index) => ({
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: node.pattern,
    route: node.route,
    node,
    ...(index === 1 && { params: { id } }),
  }));

  for (const info of chain) {
    info.chain = chain;
    withResourceKeys(info);
  }

  return withResolvedView(chain[1]!);
}

export function createUsersIdNode(overrides: Partial<RouteInstance> = {}): RouteNode {
  const node = {
    route: createTestRoute(USERS_ID_PATTERN, overrides),
    content: { kind: 'view' as const, loader: '', content: '', cache: false },
    segment: USERS_ID_PATTERN,
    pattern: USERS_ID_PATTERN,
    matchScore: computeMatchScore(USERS_ID_PATTERN),
    parent: null,
    children: [] as RouteNode[],
    depth: 0,
    isIndex: false,
    branch: [] as readonly RouteNode[],
  } as RouteNode;
  node.branch = [node];
  return node;
}

export function createUsersIdMatch(id: string, node: RouteNode): MatchedRouteInfo {
  const pathname = `/users/${id}`;
  const match: MatchedRouteInfo = {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern: USERS_ID_PATTERN,
    route: node.route,
    node,
    params: { id },
  };
  return withResolvedView(withResourceKeys(match));
}

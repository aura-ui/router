import type { RouteInstance } from '../../core';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteNode } from '../../core/route-tree/route-node.types';

import { createMatchedRoute } from './create-mock-transaction';
import {
  createTestRouteNode,
  linkRouteNodeBranch,
} from './route-tree-fixtures';
import { withResolvedView } from './with-resolved-view';

export const USERS_LAYOUT_PATTERN = '/users';
export const USERS_ID_PATTERN = '/users/:id';

export function createUsersLayoutNode(): RouteNode {
  return createTestRouteNode(USERS_LAYOUT_PATTERN, {
    route: { layout: 'users-shell' } as Partial<RouteInstance>,
    segment: USERS_LAYOUT_PATTERN,
  });
}

export function createUsersIdNode(overrides: Partial<RouteInstance> = {}): RouteNode {
  return createTestRouteNode(USERS_ID_PATTERN, {
    route: overrides,
    segment: USERS_ID_PATTERN,
  });
}

export function createNestedUsersIdSetup(leafOverrides: Partial<RouteInstance> = {}): {
  parent: RouteNode;
  leaf: RouteNode;
} {
  const parent = createUsersLayoutNode();
  const leaf = createUsersIdNode(leafOverrides);
  linkRouteNodeBranch([parent, leaf]);
  return { parent, leaf };
}

export function createNestedUsersIdMatch(id: string, leaf: RouteNode): MatchedRouteInfo {
  const parent = leaf.parent!;
  const pathname = `/users/${id}`;
  const chain: MatchedRouteInfo[] = [parent, leaf].map((node, index) =>
    createMatchedRoute(pathname, {
      asRoute: node.route,
      pattern: node.pattern,
      node,
      ...(index === 1 ? { params: { id } } : {}),
    }),
  );

  for (const info of chain) {
    info.chain = chain;
  }

  return withResolvedView(chain[1]!);
}

export function createUsersIdMatch(id: string, node: RouteNode): MatchedRouteInfo {
  return createMatchedRoute(`/users/${id}`, {
    asRoute: node.route,
    pattern: USERS_ID_PATTERN,
    node,
    params: { id },
    attachResolvedView: true,
  });
}

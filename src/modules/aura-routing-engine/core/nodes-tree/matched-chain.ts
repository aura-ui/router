import type { MatchedRouteInfo } from '../aura-routing-url-matcher';
import type { RouteNode } from './route-node.types';

/**
 * Стабильный ключ маршрута для сравнения в LCA diff.
 * @example info с node.fullPath `/settings/profile` → `'/settings/profile'`
 */
export function routeMatchKey(info: MatchedRouteInfo): string {
  return info.node?.fullPath ?? info.routePath;
}

/**
 * Один и тот же route instance (reentered, identity check).
 * @example same node → true; `/a` vs `/b` → false
 */
export function isSameRouteMatch(a: MatchedRouteInfo, b: MatchedRouteInfo): boolean {
  if (a.node && b.node) return a.node === b.node;
  return a.routePath === b.routePath && a.route === b.route;
}

/**
 * Цепочка active branch root → leaf; без chain — flat `[info]`.
 * @example nested leaf с chain [settings, profile] → оба узла
 */
export function getActiveChain(info: MatchedRouteInfo): MatchedRouteInfo[] {
  if (info.chain?.length) return info.chain;
  return [info];
}

/**
 * Конечный (leaf) match в ветке — контентный маршрут.
 * @example chain [settings, profile] → profile
 */
export function getLeafMatch(info: MatchedRouteInfo): MatchedRouteInfo {
  const chain = getActiveChain(info);
  return chain[chain.length - 1]!;
}

/**
 * Обновляет url/hash на всех звеньях chain (hash-only, без processor).
 * @example `/page#top` → url и hash обновлены у parent и leaf
 */
export function syncChainUrl(info: MatchedRouteInfo, url: string, hash: string): void {
  for (const entry of getActiveChain(info)) {
    entry.url = url;
    entry.hash = hash;
  }
}

export interface NavigationChainBase {
  url: string;
  pathname: string;
  search: string;
  hash: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * Из leaf RouteNode строит MatchedRouteInfo[] по node.branch; возвращает leaf.
 * @example leaf profile → chain [{settings}, {profile}], все с общим chain
 */
export function attachNavigationChain(
  leaf: RouteNode,
  base: NavigationChainBase,
  resolveParams: (pathname: string, fullPath: string) => Record<string, string> | null,
): MatchedRouteInfo {
  const chain = leaf.branch.map((node, index) => {
    const isLeaf = index === leaf.branch.length - 1;
    const params = isLeaf
      ? base.params
      : resolveParams(base.pathname, node.fullPath) ?? undefined;

    const info: MatchedRouteInfo = {
      url: base.url,
      pathname: base.pathname,
      search: base.search,
      hash: base.hash,
      routePath: node.fullPath,
      route: node.route,
      node,
      ...(params && Object.keys(params).length > 0 && { params }),
      ...(isLeaf && base.query && Object.keys(base.query).length > 0 && { query: base.query }),
    };

    return info;
  });

  for (const info of chain) {
    info.chain = chain;
  }

  return chain[chain.length - 1]!;
}

/**
 * Собирает chain из произвольного списка nodes (unit-тесты, mocks).
 * @example nodes [settings, profile] → MatchedRouteInfo[] с общим chain
 */
export function buildMatchedChain(
  nodes: RouteNode[],
  createInfo: (node: RouteNode) => MatchedRouteInfo,
): MatchedRouteInfo[] {
  const chain = nodes.map((node) => {
    const info = createInfo(node);
    info.node = node;
    return info;
  });

  for (const info of chain) {
    info.chain = chain;
  }

  return chain;
}

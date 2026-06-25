import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteNode } from './route-node.types';
import { routeMatchKey } from './matched-chain';

/**
 * Индекс LCA: deepest общий prefix двух root→leaf цепочек по pattern.
 * @example [settings, profile] vs [settings, security] → 0 (settings)
 * @example [settings, profile] vs [home] → -1 (нет общего prefix)
 */
export function findBranchLcaIndex(
  fromChain: MatchedRouteInfo[],
  toChain: MatchedRouteInfo[],
): number {
  const limit = Math.min(fromChain.length, toChain.length);
  let lcaIndex = -1;

  for (let i = 0; i < limit; i++) {
    if (routeMatchKey(fromChain[i]!) !== routeMatchKey(toChain[i]!)) break;
    lcaIndex = i;
  }

  return lcaIndex;
}

/**
 * LCA-узел как MatchedRouteInfo (элемент fromChain на индексе LCA).
 * @example index 0 → settings; index -1 → null
 */
export function findLca(
  fromChain: MatchedRouteInfo[],
  toChain: MatchedRouteInfo[],
): MatchedRouteInfo | null {
  const index = findBranchLcaIndex(fromChain, toChain);
  return index >= 0 ? fromChain[index]! : null;
}

/**
 * LCA по parent/depth ссылкам — O(depth), без массивов (одно дерево).
 * @example profile leaf vs edit leaf под profile → profile
 */
export function findLcaNodes(from: RouteNode, to: RouteNode): RouteNode | null {
  let a: RouteNode | null = from;
  let b: RouteNode | null = to;

  while (a && b && a.depth > b.depth) a = a.parent;
  while (a && b && b.depth > a.depth) b = b.parent;

  while (a && b && a !== b) {
    a = a.parent;
    b = b.parent;
  }

  return a;
}

/**
 * Deactivate-ветка: узлы ниже LCA, порядок leaf → root (LCA не входит).
 * @example lcaIndex 0, from [settings, profile] → [profile]
 * @example lcaIndex -1, from [settings, profile] → [profile, settings]
 */
export function buildExitRoutes(
  fromChain: MatchedRouteInfo[],
  lcaIndex: number,
): MatchedRouteInfo[] {
  if (lcaIndex < 0) return fromChain.slice().reverse();
  return fromChain.slice(lcaIndex + 1).reverse();
}

/**
 * Activate-ветка: узлы ниже LCA, порядок root → leaf (LCA не входит).
 * @example lcaIndex 0, to [settings, security] → [security]
 * @example lcaIndex -1, to [home] → [home]
 */
export function buildEnterRoutes(
  toChain: MatchedRouteInfo[],
  lcaIndex: number,
): MatchedRouteInfo[] {
  if (lcaIndex < 0) return toChain.slice();
  return toChain.slice(lcaIndex + 1);
}

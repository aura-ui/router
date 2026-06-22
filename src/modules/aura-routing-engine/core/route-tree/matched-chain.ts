import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteNode } from './route-node.types';

/**
 * Стабильный ключ маршрута для сравнения в LCA diff.
 * @example info с node.fullPath `/settings/profile` → `'/settings/profile'`
 */
export function routeMatchKey(info: MatchedRouteInfo): string {
  return info.node?.fullPath ?? info.routePath;
}

/**
 * Один и тот же route instance (reenter shortcut, identity check).
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
 * Синхронизирует `url` и `hash` на всех звеньях active chain после hash-only навигации.
 *
 * Nested chain — не несколько URL в браузере, а несколько `<aura-route>`, активных для
 * **одного** pathname. У parent (`/settings`) и leaf (`/settings/profile`) разные `routePath`
 * / `node.fullPath`, но одинаковые `url`, `pathname`, `search`, `hash` (см. `attachNavigationChain`).
 *
 * При переходе только якоря (`/settings/profile` → `/settings/profile#tab`) pathname не меняется,
 * processor и lifecycle не запускаются (`AuraRoutingEngine.finalizeAnchorNavigation`), но `prev`
 * должен отражать новый hash. Функция проходит `getActiveChain(info)` и ставит **один и тот же**
 * `url` и `hash` на parent, leaf и все промежуточные звенья — иначе часть chain устареет.
 *
 * Обновляются только `entry.url` и `entry.hash`. `pathname`, `search`, `params`, `query` не
 * трогаются — при hash-only они не менялись.
 *
 * @example
 * ```html
 * <aura-route path="/settings">
 *   <aura-route path="profile">...</aura-route>
 * </aura-route>
 * ```
 * URL `/settings/profile#tab` → chain [settings, profile]; у обоих:
 * `url = '/settings/profile#tab'`, `hash = '#tab'`
 */
export function syncChainUrl(info: MatchedRouteInfo, url: string, hash: string): void {
  for (const entry of getActiveChain(info)) {
    entry.url = url;
    entry.hash = hash;
  }
}

/** Общие поля URL браузера и match-результат leaf — одинаковые для всех звеньев chain. */
export interface NavigationChainBase {
  url: string;
  pathname: string;
  search: string;
  hash: string;
  /** Path params leaf — результат `matchPath()` по pathname. */
  params?: Record<string, string>;
  /** Query string — только у leaf (контентный маршрут). */
  query?: Record<string, string>;
}

/**
 * Собирает active branch (root → leaf) в массив `MatchedRouteInfo` и связывает их через `chain`.
 *
 * Вызывается из `AuraRoutingUrlMatcher.toRouteInfo()` после match по pathname.
 *
 * **Зачем chain:** nested-маршруты активируют несколько `<aura-route>` одновременно
 * (layout parent + content leaf), но в браузере один URL. Engine и branch diff нужен
 * не один match, а вся ветка — для `exitRoutes` / `enterRoutes` и lifecycle.
 *
 * **Что общее у всех звеньев** (из `base`): `url`, `pathname`, `search`, `hash` —
 * это snapshot текущей навигации; parent и leaf «живут» под одним pathname.
 *
 * **Что своё у каждого звена:** `routePath` (= `node.fullPath`), `route`, `node`.
 * У `/settings` и `/settings/profile` разные fullPath, но один pathname.
 *
 * **Params:** leaf берёт готовые `base.params` из matcher; у предков в ветке —
 * через `resolveParams(pathname, node.fullPath)` (сегментные :param на каждом уровне).
 *
 * **Query:** только на leaf — search относится к конечному URL, не к layout-узлам.
 *
 * На каждое звено вешается ссылка `info.chain = chain` (один массив на всех).
 * Возвращает `MatchedRouteInfo` leaf — точку входа для engine (`to`, `prev`).
 *
 * @example
 * ```html
 * <aura-route path="/settings">
 *   <aura-route path="profile">...</aura-route>
 * </aura-route>
 * ```
 * pathname `/settings/profile` → leaf = profileNode, chain:
 * `[ { settings, url/pathname/... общие }, { profile, + params, + query } ]`
 */
export function attachNavigationChain(
  /** Конечный (deepest) RouteNode — результат `matchPath()`. */
  leaf: RouteNode,
  /** URL snapshot + params/query leaf из matcher. */
  base: NavigationChainBase,
  /** Path params для ancestor-узлов ветки (не leaf). */
  resolveParams: (pathname: string, fullPath: string) => Record<string, string> | null,
): MatchedRouteInfo {
  // leaf.branch уже содержит root → leaf (вычислено при buildRouteTree).
  const chain = leaf.branch.map((node, index) => {
    const isLeaf = index === leaf.branch.length - 1;

    const params = isLeaf
      ? base.params
      : resolveParams(base.pathname, node.fullPath) ?? undefined;

    const info: MatchedRouteInfo = {
      // Браузерный URL — один на всю ветку.
      url: base.url,
      pathname: base.pathname,
      search: base.search,
      hash: base.hash,
      // MatchedRouteInfo.routePath хранит resolved fullPath (не attr path).
      routePath: node.fullPath,
      route: node.route,
      node,
      ...(params && Object.keys(params).length > 0 && { params }),
      ...(isLeaf && base.query && Object.keys(base.query).length > 0 && { query: base.query }),
    };

    return info;
  });

  // Обратная ссылка: getActiveChain(info) вернёт полную ветку с любого звена.
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

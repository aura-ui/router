import type { AURARoute } from '../../../aura-route/core/aura-route';

/** Узел дерева маршрутов, собранного из DOM. @example fullPath `/settings/profile`, branch [settings, profile] */
export interface RouteNode {
  route: AURARoute;
  /** Значение attr `path` (может быть relative или absolute). @example `'profile'` */
  routePath: string;
  /** Resolved URL для match/registry. @example `'/settings/profile'` */
  fullPath: string;
  parent: RouteNode | null;
  children: RouteNode[];
  /** 0 = direct child of router. @example settings=0, profile=1 */
  depth: number;
  /** Index child: `path=""` → URL родителя. @example `/settings` + `""` → `/settings` */
  isIndex: boolean;
  /** Ветка root → this, вычисляется один раз при сборке. @example [settings, profile] */
  branch: readonly RouteNode[];
}

/**
 * Результат `buildRouteTree()`: in-memory снимок дерева `<aura-route>`.
 * Сохраняется в `AuraRoutingRouteRegistry` при `replace()` / `register()`.
 */
export interface RouteTreeSnapshot {
  /**
   * Верхний уровень дерева — маршруты без parent `<aura-route>` (прямые дети `<aura-router>`).
   * Используется для обхода структуры (`getTree()`), nested lifecycle и branch diff.
   * @example `[ RouteNode('/') , RouteNode('/settings' → profile, security) ]`
   */
  roots: RouteNode[];

  /**
   * Индекс всех узлов по resolved URL (`fullPath`) — O(1) lookup.
   * Используется registry: `get(path)`, `getNode(fullPath)`, проверка дубликатов.
   * @example `Map { '/settings' → settingsNode, '/settings/profile' → profileNode }`
   */
  nodesByFullPath: Map<string, RouteNode>;

  /**
   * Подмножество узлов, по которым `AuraRoutingUrlMatcher.matchPath()` сопоставляет pathname.
   * Сюда попадают: листья, index child (`path=""`), parent без index child.
   * Parent с index child не включается — тот же URL обрабатывает index.
   * @example `['/settings/profile', '/settings/security', '/settings']` → registry `routesPath()`
   */
  matchableNodes: RouteNode[];
}

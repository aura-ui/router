import { AuraRoute } from '../../../aura-route/core/aura-route';
import { resolveFullPath } from './resolve-full-path';
import type { RouteNode, RouteTreeSnapshot } from './route-node.types';

/**
 * Собирает in-memory дерево из списка `<aura-route>` (вложенных или flat).
 *
 * Единого synthetic root-node нет — верхний уровень это forest: массив `roots` (top-level
 * `RouteNode` без `<aura-route>`-родителя). Каждый `AuraRoute` превращается в `RouteNode`
 * (обогащённая обёртка: `fullPath`, `depth`, `branch`, `parent`/`children`).
 *
 * В `rootNodes` попадают только корни (`.map` по `rootRoutes`), но все узлы создаются:
 * `buildRouteNode` рекурсивно вкладывает детей в `node.children`, а side-effect —
 * `nodesByFullPath` (плоский индекс всех узлов) и `matchableNodes`.
 *
 * @example [home, settings→profile] → roots: [homeNode, settingsNode], settingsNode.children: [profileNode]
 */
export function buildRouteTree(routes: AuraRoute[]): RouteTreeSnapshot {
  const knownRoutes = new Set(routes);
  const { rootRoutes, childRoutesByParent } = buildParentChildHierarchy(routes, knownRoutes);
  const nodesByFullPath = new Map<string, RouteNode>();
  const matchableNodes: RouteNode[] = [];

  const rootNodes = rootRoutes.map((rootRoute) =>
    buildRouteNode(rootRoute, null, 0, nodesByFullPath, matchableNodes, childRoutesByParent),
  );

  return { roots: rootNodes, nodesByFullPath, matchableNodes };
}

/**
 * Собирает все `RouteNode` поддерева от переданного узла в плоский массив (flatten).
 *
 * В массив попадает сам `node` и каждый его потомок — depth-first, pre-order (как
 * `walkRouteSubtree`). Это не все узлы forest: соседние ветки и другие корни из `roots`
 * не включаются. `node` не обязан быть top-level root — можно передать любой узел, например
 * `settings`, и получить `[settings, profile, security]`.
 *
 * Для lookup любого узла всего снимка без обхода используй `RouteTreeSnapshot.nodesByFullPath`.
 *
 * @example collectRouteSubtreeNodes(settingsNode) → [settings, profile, security]
 */
export function collectRouteSubtreeNodes(node: RouteNode): RouteNode[] {
  const nodes: RouteNode[] = [];
  walkRouteSubtree(node, (n) => nodes.push(n));
  return nodes;
}

/**
 * Строит иерархию parent → children из flat-списка (один проход, без querySelectorAll на каждый узел).
 * @example settings.parent=null; profile.parent=settings
 */
function buildParentChildHierarchy(
  routes: AuraRoute[],
  knownRoutes: Set<AuraRoute>,
): { rootRoutes: AuraRoute[]; childRoutesByParent: Map<AuraRoute, AuraRoute[]> } {
  const childRoutesByParent = new Map<AuraRoute, AuraRoute[]>();
  const rootRoutes: AuraRoute[] = [];

  for (const route of routes) {
    const parentRoute = findParentRoute(route, knownRoutes);
    if (parentRoute) {
      let siblings = childRoutesByParent.get(parentRoute);
      if (!siblings) {
        siblings = [];
        childRoutesByParent.set(parentRoute, siblings);
      }
      siblings.push(route);
    } else {
      rootRoutes.push(route);
    }
  }

  return { rootRoutes, childRoutesByParent };
}

/**
 * Ближайший `<aura-route>`-родитель из knownRoutes (не router).
 * @example profile внутри settings → settings; top-level → null
 */
function findParentRoute(route: AuraRoute, knownRoutes: Set<AuraRoute>): AuraRoute | null {
  const closestMethod = route.parentElement?.closest;
  if (typeof closestMethod !== 'function') return null;

  const parentRoute = route.parentElement?.closest(AuraRoute.is) as AuraRoute | null;
  return parentRoute && knownRoutes.has(parentRoute) ? parentRoute : null;
}

/**
 * Прямые дочерние `<aura-route>` того же уровня (siblings) для `parentRoute`.
 *
 * Основной источник — `childRoutesByParent` из `buildParentChildHierarchy`: все элементы
 * из входного `routes[]`, у которых родитель есть в `knownRoutes`.
 *
 * DOM fallback (`queryDirectChildRoutes`) нужен, когда в `routes[]` передан только parent,
 * а дети существуют в разметке, но не попали в массив — их нет в `knownRoutes` и map.
 * @example buildRouteTree([settings]) при `<aura-route path="profile">` внутри settings в DOM
 *
 * В production (`AuraRouter.refreshRoutes`) массив полный — `querySelectorAll` собирает все
 * `<aura-route>`, поэтому для родителей с детьми достаточно map. Fallback всё равно вызывается
 * на листьях (map пуст → `querySelectorAll` → `[]`) — это ожидаемо и безопасно.
 */
function getDirectChildRoutes(
  parentRoute: AuraRoute,
  childRoutesByParent: Map<AuraRoute, AuraRoute[]>,
): AuraRoute[] {
  const siblings = childRoutesByParent.get(parentRoute);
  if (siblings?.length) return siblings;
  return queryDirectChildRoutes(parentRoute);
}

/** DOM fallback: `:scope > aura-route`, когда дети не были переданы во flat `routes[]`. */
function queryDirectChildRoutes(parentRoute: AuraRoute): AuraRoute[] {
  if (typeof parentRoute.querySelectorAll !== 'function') return [];
  return Array.from(parentRoute.querySelectorAll<AuraRoute>(`:scope > ${AuraRoute.is}`));
}

/**
 * Создаёт RouteNode, branch, индексирует nodesByFullPath, регистрирует matchable endpoints.
 * @example settings + child profile → fullPath `/settings/profile`, branch [settings, profile]
 */
function buildRouteNode(
  route: AuraRoute,
  parentNode: RouteNode | null,
  depth: number,
  nodesByFullPath: Map<string, RouteNode>,
  matchableNodes: RouteNode[],
  childRoutesByParent: Map<AuraRoute, AuraRoute[]>,
): RouteNode {
  const routePath = route.path ?? '';
  const fullPath = resolveFullPath(parentNode?.fullPath ?? null, routePath);

  if (nodesByFullPath.has(fullPath)) {
    console.warn(`Duplicate route fullPath "${fullPath}" — previous route will be overwritten`);
  }

  const node: RouteNode = {
    route,
    routePath,
    fullPath,
    parent: parentNode,
    children: [],
    depth,
    isIndex: routePath === '',
    branch: [],
  };

  node.branch = parentNode ? parentNode.branch.concat(node) : [node];
  nodesByFullPath.set(fullPath, node);

  for (const childRoute of getDirectChildRoutes(route, childRoutesByParent)) {
    node.children.push(
      buildRouteNode(childRoute, node, depth + 1, nodesByFullPath, matchableNodes, childRoutesByParent),
    );
  }

  registerMatchableNode(node, matchableNodes);

  return node;
}

/**
 * Решает, участвует ли узел в URL-matching, и при необходимости добавляет его в `matchableNodes`.
 *
 * `matchableNodes` — подмножество всех `RouteNode`, по которым `AuraRoutingUrlMatcher.matchPath()`
 * сопоставляет pathname. Не каждый узел дерева matchable: layout-родитель с index child
 * покрывает тот же URL, что и ребёнок с `path=""`, поэтому дублировать parent в matcher не нужно
 * (модель как в React Router).
 *
 * Узел регистрируется, если выполняется хотя бы одно условие:
 * - **лист** (`children.length === 0`) — конечный endpoint, например `/settings/profile`;
 * - **index child** (`isIndex`, т.е. `path=""`) — URL совпадает с родителем, например `/settings`;
 * - **родитель без index child** — у узла есть дети, но ни один не index; тогда URL родителя
 *   (`/settings`) matchable сам по себе, без отдельного index route.
 *
 * Узел НЕ регистрируется, если у него есть дети и среди них есть index child: тот же `fullPath`
 * обрабатывает index, parent остаётся layout-only для nested lifecycle/outlet.
 *
 * @example settings + profile + security (без index)
 *   matchable: `/settings`, `/settings/profile`, `/settings/security`
 * @example settings + index (`path=""`)
 *   matchable: только `/settings` (index); parent settings не попадает в matcher
 */
function registerMatchableNode(node: RouteNode, matchableNodes: RouteNode[]): void {
  const hasIndexChild = node.children.some((child) => child.isIndex);
  if (node.children.length === 0 || node.isIndex || !hasIndexChild) {
    matchableNodes.push(node);
  }
}

/**
 * Depth-first обход поддерева от заданного узла: сам `node` и все его потомки по `children`.
 *
 * Не обходит весь forest и не выходит за пределы переданного поддерева — соседние ветки
 * и другие корни из `roots` не затрагиваются. Порядок pre-order: сначала текущий узел,
 * затем каждый child слева направо, рекурсивно.
 *
 * Используется как общий примитив обхода; публичный flatten — `collectRouteSubtreeNodes()`.
 * Для всех узлов всего снимка без обхода — `RouteTreeSnapshot.nodesByFullPath`.
 *
 * @example walkRouteSubtree(settings, visit) → settings, profile, security (если такие children)
 */
function walkRouteSubtree(node: RouteNode, visit: (node: RouteNode) => void): void {
  visit(node);
  for (const child of node.children) {
    walkRouteSubtree(child, visit);
  }
}

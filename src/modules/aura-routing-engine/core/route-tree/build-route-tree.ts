import { AuraRoute } from '../../../aura-route/core/aura-route';
import { computeMatchScore } from '../match/route-score';

import { normalizeRouteSegment, resolvePattern } from './resolve-pattern';
import type { RouteNode, RouteTreeSnapshot } from './route-node.types';

/**
 * Собирает in-memory дерево из списка `<aura-route>` (вложенных или flat).
 *
 * Единого synthetic root-node нет — верхний уровень это forest: массив `roots` (top-level
 * `RouteNode` без `<aura-route>`-родителя). Каждый `AuraRoute` превращается в `RouteNode`
 * (обогащённая обёртка: `pattern`, `depth`, `branch`, `parent`/`children`).
 *
 * В `rootNodes` попадают только корни (`.map` по `rootRoutes`), но все узлы создаются:
 * `buildRouteNode` рекурсивно вкладывает детей в `node.children`, а side-effect —
 * `nodesByPattern` (плоский индекс всех узлов) и `matchableNodes`.
 *
 * @example [home, settings→profile] → roots: [homeNode, settingsNode], settingsNode.children: [profileNode]
 */
export function buildRouteTree(routes: AuraRoute[]): RouteTreeSnapshot {
  const { rootRoutes, routeChildren } = buildParentChildHierarchy(routes);
  const nodesByPattern = new Map<string, RouteNode>();
  const matchableNodes: RouteNode[] = [];

  const rootNodes = rootRoutes.map((route) =>
    buildRouteNode(route, null, 0, nodesByPattern, matchableNodes, routeChildren),
  );

  return { roots: rootNodes, nodesByPattern, matchableNodes };
}

/**
 * Собирает все `RouteNode` поддерева от переданного узла в плоский массив (flatten).
 *
 * В массив попадает сам `node` и каждый его потомок — depth-first, pre-order (как
 * `walkRouteSubtree`). Это не все узлы forest: соседние ветки и другие корни из `roots`
 * не включаются. `node` не обязан быть top-level root — можно передать любой узел, например
 * `settings`, и получить `[settings, profile, security]`.
 *
 * Для lookup любого узла всего снимка без обхода используй `RouteTreeSnapshot.nodesByPattern`.
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
function buildParentChildHierarchy(routes: AuraRoute[]): {
  rootRoutes: AuraRoute[];
  routeChildren: Map<AuraRoute, AuraRoute[]>
} {
  const knownRoutes = new Set(routes);
  const routeChildren = new Map<AuraRoute, AuraRoute[]>();
  const rootRoutes: AuraRoute[] = [];

  for (const route of routes) {
    const parentRoute = findParentRoute(route, knownRoutes);
    if (parentRoute) {
      let children = routeChildren.get(parentRoute);
      if (!children) {
        children = [];
        routeChildren.set(parentRoute, children);
      }
      children.push(route);
    } else {
      rootRoutes.push(route);
    }
  }

  return { rootRoutes, routeChildren };
}

/**
 * Ближайший `<aura-route>`-родитель из knownRoutes (не router).
 * @example profile внутри settings → settings; top-level → null
 */
function findParentRoute(route: AuraRoute, knownRoutes: Set<AuraRoute>): AuraRoute | null {
  const parentElement = route.parentElement;
  if (!parentElement) return null;

  const parentRoute = typeof parentElement.closest === 'function'
    ? parentElement.closest(AuraRoute.is) as AuraRoute
    : null;

  return parentRoute && knownRoutes.has(parentRoute) ? parentRoute : null;
}

/**
 * Прямые дочерние `<aura-route>` того же уровня (siblings) для `parentRoute`.
 *
 * Основной источник — `routeChildren` из `buildParentChildHierarchy`: все элементы
 * из входного `routes[]`, у которых родитель есть в `knownRoutes`.
 *
 * DOM fallback (`queryDirectRouteChildren`) нужен, когда в `routes[]` передан только parent,
 * а дети существуют в разметке, но не попали в массив — их нет в `knownRoutes` и map.
 * @example buildRouteTree([settings]) при `<aura-route path="profile">` внутри settings в DOM
 *
 * В production (`AuraRouter.refreshRoutes`) массив полный — `querySelectorAll` собирает все
 * `<aura-route>`, поэтому для родителей с детьми достаточно map. Fallback всё равно вызывается
 * на листьях (map пуст → `querySelectorAll` → `[]`) — это ожидаемо и безопасно.
 */
function getDirectRouteChildren(parentRoute: AuraRoute, routeChildren: Map<AuraRoute, AuraRoute[]>): AuraRoute[] {
  const children = routeChildren.get(parentRoute);
  if (children?.length) return children;
  return queryDirectRouteChildren(parentRoute);
}

/** DOM fallback: `:scope > aura-route`, когда дети не были переданы во flat `routes[]`. */
function queryDirectRouteChildren(parentRoute: AuraRoute): AuraRoute[] {
  if (typeof parentRoute.querySelectorAll !== 'function') return [];
  return Array.from(parentRoute.querySelectorAll<AuraRoute>(`:scope > ${AuraRoute.is}`));
}

/**
 * Создаёт RouteNode, branch, индексирует nodesByPattern, регистрирует matchable endpoints.
 * @example settings + child profile → pattern `/settings/profile`, branch [settings, profile]
 */
function buildRouteNode(
  route: AuraRoute,
  parentNode: RouteNode | null,
  depth: number,
  nodesByPattern: Map<string, RouteNode>,
  matchableNodes: RouteNode[],
  routeChildren: Map<AuraRoute, AuraRoute[]>,
): RouteNode {
  const segment = normalizeRouteSegment((route as unknown as Element).getAttribute('path') ?? '');
  const pattern = resolvePattern(parentNode?.pattern ?? null, segment);

  const existing = nodesByPattern.get(pattern);
  if (existing && !isIndexChildOf(existing, parentNode, segment)) {
    console.warn(`Duplicate route pattern "${pattern}" — previous route will be overwritten`);
  }

  const node: RouteNode = {
    route,
    segment,
    pattern,
    matchScore: computeMatchScore(pattern),
    parent: parentNode,
    children: [],
    depth,
    isIndex: segment === '',
    branch: [],
  };

  node.branch = parentNode ? parentNode.branch.concat(node) : [node];
  nodesByPattern.set(pattern, node);

  for (const childRoute of getDirectRouteChildren(route, routeChildren)) {
    node.children.push(
      buildRouteNode(childRoute, node, depth + 1, nodesByPattern, matchableNodes, routeChildren),
    );
  }

  registerMatchableNode(node, matchableNodes);

  return node;
}

/** Index child shares parent's URL — expected overlap in nodesByPattern, not a duplicate route. */
function isIndexChildOf(existing: RouteNode, parentNode: RouteNode | null, segment: string): boolean {
  return segment === '' && parentNode !== null && existing === parentNode;
}

/**
 * Whether `node` is a URL-matching endpoint (`matchableNodes`).
 *
 * Leaves and index children always register. A non-index parent registers only when it has
 * `layout` (shell URL). Path groups (children, no layout) stay off the matcher.
 */
function registerMatchableNode(node: RouteNode, matchableNodes: RouteNode[]): void {
  const isMatchableLayoutParent = node.route.hasLayout && !node.children.some((c) => c.isIndex);
  if (node.children.length === 0 || node.isIndex || isMatchableLayoutParent) {
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
 * Для всех узлов всего снимка без обхода — `RouteTreeSnapshot.nodesByPattern`.
 *
 * @example walkRouteSubtree(settings, visit) → settings, profile, security (если такие children)
 */
function walkRouteSubtree(node: RouteNode, visit: (node: RouteNode) => void): void {
  visit(node);
  for (const child of node.children) {
    walkRouteSubtree(child, visit);
  }
}

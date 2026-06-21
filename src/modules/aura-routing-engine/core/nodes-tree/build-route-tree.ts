import { AURARoute } from '../../../aura-route/core/aura-route';
import { resolveFullPath } from './resolve-full-path';
import type { RouteNode, RouteTreeSnapshot } from './route-node.types';

/**
 * Собирает in-memory дерево из списка `<aura-route>` (вложенных или flat).
 * @example [home, settings→profile] → roots, byFullPath, matchableNodes
 */
export function buildRouteTree(routes: AURARoute[]): RouteTreeSnapshot {
  const inSet = new Set(routes);
  const { roots, childrenOf } = buildChildIndex(routes, inSet);
  const byFullPath = new Map<string, RouteNode>();
  const matchableNodes: RouteNode[] = [];

  const rootNodes = roots.map((route) =>
    attachNode(route, null, 0, byFullPath, matchableNodes, childrenOf),
  );

  return { roots: rootNodes, byFullPath, matchableNodes };
}

/**
 * Все узлы поддерева в порядке обхода depth-first.
 * @example root `/settings` → [settings, profile, security]
 */
export function collectRouteNodes(root: RouteNode): RouteNode[] {
  const nodes: RouteNode[] = [];
  walkTree(root, (node) => nodes.push(node));
  return nodes;
}

/**
 * Один проход: кто root, у кого какие дети (без querySelectorAll на каждый узел).
 * @example settings.parent=null; profile.parent=settings
 */
function buildChildIndex(
  routes: AURARoute[],
  inSet: Set<AURARoute>,
): { roots: AURARoute[]; childrenOf: Map<AURARoute, AURARoute[]> } {
  const childrenOf = new Map<AURARoute, AURARoute[]>();
  const roots: AURARoute[] = [];

  for (const route of routes) {
    const parent = findParentRoute(route, inSet);
    if (parent) {
      let siblings = childrenOf.get(parent);
      if (!siblings) {
        siblings = [];
        childrenOf.set(parent, siblings);
      }
      siblings.push(route);
    } else {
      roots.push(route);
    }
  }

  return { roots, childrenOf };
}

/**
 * Ближайший `<aura-route>`-родитель из input-set (не router).
 * @example profile внутри settings → settings; top-level → null
 */
function findParentRoute(route: AURARoute, inSet: Set<AURARoute>): AURARoute | null {
  const closest = route.parentElement?.closest;
  if (typeof closest !== 'function') return null;

  const parent = route.parentElement.closest(AURARoute.is) as AURARoute | null;
  return parent && inSet.has(parent) ? parent : null;
}

/**
 * Дочерние routes: сначала из index, иначе DOM fallback `:scope > aura-route`.
 * @example settings → [profile, security]
 */
function getChildRoutes(
  route: AURARoute,
  childrenOf: Map<AURARoute, AURARoute[]>,
): AURARoute[] {
  const indexed = childrenOf.get(route);
  if (indexed?.length) return indexed;
  return directChildRoutes(route);
}

/** Прямые дочерние `<aura-route>` в DOM (если не переданы в flat-списке). */
function directChildRoutes(parent: AURARoute): AURARoute[] {
  if (typeof parent.querySelectorAll !== 'function') return [];
  return Array.from(parent.querySelectorAll<AURARoute>(`:scope > ${AURARoute.is}`));
}

/**
 * Создаёт RouteNode, branch, индексирует byFullPath, регистрирует matchable endpoints.
 * @example settings + child profile → fullPath `/settings/profile`, branch [settings, profile]
 */
function attachNode(
  route: AURARoute,
  parent: RouteNode | null,
  depth: number,
  byFullPath: Map<string, RouteNode>,
  matchableNodes: RouteNode[],
  childrenOf: Map<AURARoute, AURARoute[]>,
): RouteNode {
  const segmentPath = route.path ?? '';
  const fullPath = resolveFullPath(parent?.fullPath ?? null, segmentPath);

  if (byFullPath.has(fullPath)) {
    console.warn(`Duplicate route fullPath "${fullPath}" — previous route will be overwritten`);
  }

  const node: RouteNode = {
    route,
    segmentPath,
    fullPath,
    parent,
    children: [],
    depth,
    isIndex: segmentPath === '',
    branch: [],
  };

  node.branch = parent ? parent.branch.concat(node) : [node];
  byFullPath.set(fullPath, node);

  for (const childRoute of getChildRoutes(route, childrenOf)) {
    node.children.push(attachNode(childRoute, node, depth + 1, byFullPath, matchableNodes, childrenOf));
  }

  registerMatchable(node, matchableNodes);

  return node;
}

/**
 * Endpoint для URL matcher: leaf, index child, или parent без index child.
 * Parent с index не регистрируем — тот же fullPath обрабатывает index (как React Router).
 */
function registerMatchable(node: RouteNode, matchableNodes: RouteNode[]): void {
  const hasIndexChild = node.children.some((child) => child.isIndex);
  if (node.children.length === 0 || node.isIndex || !hasIndexChild) {
    matchableNodes.push(node);
  }
}

/** Обход дерева с callback на каждый узел. */
function walkTree(node: RouteNode, visit: (node: RouteNode) => void): void {
  visit(node);
  for (const child of node.children) {
    walkTree(child, visit);
  }
}

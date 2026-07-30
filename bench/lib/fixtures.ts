/**
 * Synthetic route trees for benchmarks (no full AuraRoute / DOM unless via jsdom helper).
 */
import type { AuraRoute } from '../../src/modules/aura-route/core/aura-route';
import type { RouteNode } from '../../src/modules/aura-routing-engine/core/route-tree/route-node.types';
import type { MatchedRouteInfo } from '../../src/modules/aura-routing-engine/core/match/url-matcher';
import { computeMatchScore } from '../../src/modules/aura-routing-engine/core/match/route-score';
import { createTestRoute } from '../../src/modules/aura-routing-engine/test/_helpers/create-test-route';
function mockRoute(path: string): AuraRoute {
  return createTestRoute(path) as unknown as AuraRoute;
}
function routeInstance(path: string): MatchedRouteInfo['route'] {
  return createTestRoute(path) as MatchedRouteInfo['route'];
}
function node(
  pattern: string,
  segment: string,
  parent: RouteNode | null,
  depth: number,
  branch: readonly RouteNode[],
  overrides: Partial<RouteNode> = {},
): RouteNode {
  return {
    route: mockRoute(segment),
    segment,
    pattern,
    matchScore: computeMatchScore(pattern),
    parent,
    children: [],
    depth,
    isIndex: segment === '',
    branch,
    ...overrides,
  };
}
/** Flat matchable endpoints: `/r-0` … `/r-{n-1}` */
export function flatMatchableNodes(count: number): RouteNode[] {
  const nodes: RouteNode[] = [];
  for (let i = 0; i < count; i++) {
    const pattern = `/r-${i}`;
    const n = node(pattern, `r-${i}`, null, 0, []);
    n.branch = [n];
    nodes.push(n);
  }
  return nodes;
}
/** Param routes: `/p-{i}/:id` — unique patterns with URLPattern groups */
export function paramMatchableNodes(count: number): RouteNode[] {
  const nodes: RouteNode[] = [];
  for (let i = 0; i < count; i++) {
    const pattern = `/p-${i}/:id`;
    const n = node(pattern, `p-${i}/:id`, null, 0, []);
    n.branch = [n];
    nodes.push(n);
  }
  return nodes;
}
/**
 * Linear chain `/c0` → `/c0/c1` → … for ancestor param re-match benches.
 * @returns leaf node and single matchable endpoint (leaf).
 */
export function linearChainRouteNodes(depth: number): { leaf: RouteNode; matchableNodes: RouteNode[] } {
  if (depth < 1) throw new RangeError('depth must be >= 1');
  let parent: RouteNode | null = null;
  const branch: RouteNode[] = [];
  for (let d = 0; d < depth; d++) {
    const segment = d === 0 ? 'c0' : `c${d}`;
    const pattern = d === 0 ? '/c0' : `${branch[d - 1]!.pattern}/c${d}`;
    const n = node(pattern, segment, parent, d, []);
    if (parent) parent.children.push(n);
    branch.push(n);
    n.branch = [...branch];
    parent = n;
  }
  const leaf = branch[branch.length - 1]!;
  return { leaf, matchableNodes: [leaf] };
}
/**
 * Nested dashboard: `/app` layout + N children `/app/section-{i}`.
 * matchableNodes = layout index + N leaves (layout is index if no explicit index — here leaves only).
 */
export function nestedDashboardMatchableNodes(sectionCount: number): {
  matchableNodes: RouteNode[];
  appLayout: RouteNode;
} {
  const app = node('/app', 'app', null, 0, []);
  app.branch = [app];
  const children: RouteNode[] = [];
  for (let i = 0; i < sectionCount; i++) {
    const pattern = `/app/section-${i}`;
    const child = node(pattern, `section-${i}`, app, 1, []);
    child.branch = [app, child];
    app.children.push(child);
    children.push(child);
  }
  const matchableNodes = [...children];
  return { matchableNodes, appLayout: app };
}
/** Minimal MatchedRouteInfo for transition-plan benches */
export function matchedLeaf(pathname: string): MatchedRouteInfo {
  const pattern = pathname;
  const seg = pathname.split('/').filter(Boolean).pop() ?? '';
  const n = node(pattern, seg, null, 0, []);
  n.branch = [n];
  const info: MatchedRouteInfo = {
    href: pathname,
    pathname,
    search: '',
    hash: '',
    pattern,
    route: routeInstance(pathname),
    node: n,
    chain: [],
  };
  info.chain = [info];
  return info;
}
/** Build chain [layout, leaf] for nested transition benches */
export function nestedChain(layoutPath: string, leafPath: string): MatchedRouteInfo[] {
  const layout = node(layoutPath, layoutPath.replace(/^\//, ''), null, 0, []);
  const leafSeg = leafPath.slice(layoutPath.length + 1);
  const leaf = node(leafPath, leafSeg, layout, 1, []);
  layout.branch = [layout];
  leaf.branch = [layout, leaf];
  layout.children = [leaf];
  const layoutInfo: MatchedRouteInfo = {
    href: leafPath,
    pathname: leafPath,
    search: '',
    hash: '',
    pattern: layout.pattern,
    route: routeInstance(layoutPath),
    node: layout,
  };
  const leafInfo: MatchedRouteInfo = {
    href: leafPath,
    pathname: leafPath,
    search: '',
    hash: '',
    pattern: leaf.pattern,
    route: routeInstance(leafPath),
    node: leaf,
  };
  const chain = [layoutInfo, leafInfo];
  for (const c of chain) c.chain = chain;
  return chain;
}
/** HTML payload sizes for dom-patch bench */
export function htmlPayload(sizeKb: number): string {
  const target = sizeKb * 1024;
  const chunk = '<div class="item"><span>bench</span><p>lorem</p></div>';
  let html = '<section id="root">';
  while (html.length < target) html += chunk;
  html += '</section>';
  return html;
}

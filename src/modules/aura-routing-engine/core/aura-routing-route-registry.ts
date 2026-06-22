import type { AURARoute } from '../../aura-route/core/aura-route';
import { buildRouteTree } from './route-tree';
import type { RouteNode } from './route-tree';

export class AuraRoutingRouteRegistry {
  private roots: RouteNode[] = [];
  private nodesByFullPath = new Map<string, RouteNode>();
  private matchableNodes: RouteNode[] = [];
  private matchablePaths: readonly string[] = [];
  private routes: AURARoute[] = [];

  register(routes: AURARoute[]): void {
    this.rebuildSnapshot([...this.routes, ...routes]);
  }

  replace(routes: AURARoute[]): void {
    this.rebuildSnapshot(routes);
  }

  private rebuildSnapshot(routes: AURARoute[]): void {
    this.routes = routes;
    const snapshot = buildRouteTree(routes);
    this.roots = snapshot.roots;
    this.nodesByFullPath = snapshot.nodesByFullPath;
    this.matchableNodes = snapshot.matchableNodes;
    this.matchablePaths = snapshot.matchableNodes.map((node) => node.fullPath);
  }

  getRoute(fullPath: string): AURARoute | undefined {
    return this.nodesByFullPath.get(fullPath)?.route;
  }

  getNode(fullPath: string): RouteNode | undefined {
    return this.nodesByFullPath.get(fullPath);
  }

  getRootNodes(): readonly RouteNode[] {
    return this.roots;
  }

  getMatchableNodes(): readonly RouteNode[] {
    return this.matchableNodes;
  }

  getMatchablePaths(): readonly string[] {
    return this.matchablePaths;
  }

  clear(): void {
    this.roots = [];
    this.nodesByFullPath.clear();
    this.matchableNodes = [];
    this.matchablePaths = [];
    this.routes = [];
  }
}

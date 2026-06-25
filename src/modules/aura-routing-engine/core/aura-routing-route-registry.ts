import type { AuraRoute } from '../../aura-route/core/aura-route';
import { buildRouteTree } from './route-tree';
import type { RouteNode } from './route-tree';

export class AuraRoutingRouteRegistry {
  private roots: RouteNode[] = [];
  private nodesByPattern = new Map<string, RouteNode>();
  private matchableNodes: RouteNode[] = [];
  private matchablePatterns: readonly string[] = [];
  private routes: AuraRoute[] = [];

  register(routes: AuraRoute[]): void {
    this.rebuildSnapshot([...this.routes, ...routes]);
  }

  replace(routes: AuraRoute[]): void {
    this.rebuildSnapshot(routes);
  }

  private rebuildSnapshot(routes: AuraRoute[]): void {
    this.routes = routes;
    const snapshot = buildRouteTree(routes);
    this.roots = snapshot.roots;
    this.nodesByPattern = snapshot.nodesByPattern;
    this.matchableNodes = snapshot.matchableNodes;
    this.matchablePatterns = snapshot.matchableNodes.map((node) => node.pattern);
  }

  getRoute(pattern: string): AuraRoute | undefined {
    return this.nodesByPattern.get(pattern)?.route;
  }

  getNode(pattern: string): RouteNode | undefined {
    return this.nodesByPattern.get(pattern);
  }

  getRootNodes(): readonly RouteNode[] {
    return this.roots;
  }

  getMatchableNodes(): readonly RouteNode[] {
    return this.matchableNodes;
  }

  getMatchablePatterns(): readonly string[] {
    return this.matchablePatterns;
  }

  clear(): void {
    this.roots = [];
    this.nodesByPattern.clear();
    this.matchableNodes = [];
    this.matchablePatterns = [];
    this.routes = [];
  }
}

import { buildRouteTree } from './route-tree/build-route-tree';
import type { AuraRoute } from '../../aura-route/core/aura-route';
import type { RouteNode } from './route-tree/route-node.types';

export class AuraRoutingRouteRegistry {
  /** Source route elements for the current snapshot. */
  private routes: AuraRoute[] = [];
  private generation = 0;

  private roots: RouteNode[] = [];
  private nodesByPattern = new Map<string, RouteNode>();
  private matchableNodes: RouteNode[] = [];
  private matchablePatterns: readonly string[] = [];

  register(routes: AuraRoute[]): void {
    this.rebuildSnapshot([...this.routes, ...routes]);
  }

  replace(routes: AuraRoute[]): void {
    this.rebuildSnapshot(routes);
  }

  clear(): void {
    this.generation++;
    this.routes = [];
    this.roots = [];
    this.nodesByPattern.clear();
    this.matchableNodes = [];
    this.matchablePatterns = [];
  }

  get generationId(): number {
    return this.generation;
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

  getNode(pattern: string): RouteNode | undefined {
    return this.nodesByPattern.get(pattern);
  }

  getRoute(pattern: string): AuraRoute | undefined {
    return this.nodesByPattern.get(pattern)?.route;
  }

  private rebuildSnapshot(routes: AuraRoute[]): void {
    this.generation++;
    this.routes = routes;
    const snapshot = buildRouteTree(routes);
    this.roots = snapshot.roots;
    this.nodesByPattern = snapshot.nodesByPattern;
    this.matchableNodes = snapshot.matchableNodes;
    this.matchablePatterns = snapshot.matchableNodes.map((node) => node.pattern);
  }
}

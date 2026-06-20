import type { AURARoute } from '../../aura-route/core/aura-route';

export class AuraRoutingRouteRegistry {
  private readonly routes = new Map<string, AURARoute>();

  register(routes: AURARoute[]): void {
    for (const route of routes) {
      const { path } = route;
      if (!path) continue;
      if (this.routes.has(path)) {
        console.warn(`Duplicate route path "${path}" — previous route will be overwritten`);
      }
      this.routes.set(path, route);
    }
  }

  replace(routes: AURARoute[]): void {
    this.routes.clear();
    for (const route of routes) {
      if (route.path) this.routes.set(route.path, route);
    }
  }

  get(path: string): AURARoute | undefined {
    return this.routes.get(path);
  }

  routesPath(): string[] {
    return [...this.routes.keys()];
  }

  clear(): void {
    this.routes.clear();
  }
}
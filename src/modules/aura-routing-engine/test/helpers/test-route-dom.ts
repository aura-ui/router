import type { AuraRoute } from '../../../aura-route/core/aura-route';
import { AuraRoute2 } from '../../../aura-route-2/core/aura-route';
import { buildRouteTree } from '../../core/route-tree/build-route-tree';

const ROUTE_TAG = 'aura-route';

function ensureTestRouteElement(): void {
  if (!customElements.get(ROUTE_TAG)) {
    customElements.define(ROUTE_TAG, AuraRoute2);
  }
}

export function createDomRoute(path: string, children: AuraRoute2[] = []): AuraRoute2 {
  ensureTestRouteElement();
  const route = document.createElement(ROUTE_TAG) as AuraRoute2;
  route.setAttribute('path', path);
  for (const child of children) {
    route.appendChild(child);
  }
  return route;
}

export function collectRoutesFromDom(...roots: AuraRoute2[]): AuraRoute[] {
  const routes: AuraRoute[] = [];

  function walk(route: AuraRoute2): void {
    routes.push(route as unknown as AuraRoute);
    for (const child of route.querySelectorAll(`:scope > ${ROUTE_TAG}`)) {
      walk(child as AuraRoute2);
    }
  }

  for (const root of roots) walk(root);
  return routes;
}

export function buildTreeFromDom(...roots: AuraRoute2[]) {
  return buildRouteTree(collectRoutesFromDom(...roots));
}

export { ROUTE_TAG };

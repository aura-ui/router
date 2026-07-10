import { AuraRoute } from '../../../aura-route/core/aura-route';
import { buildRouteTree } from '../../core/route-tree/build-route-tree';

const ROUTE_TAG = 'aura-route';

function ensureTestRouteElement(): void {
  if (!customElements.get(ROUTE_TAG)) {
    customElements.define(ROUTE_TAG, AuraRoute);
  }
}

export function createDomRoute(path: string, children: AuraRoute[] = []): AuraRoute {
  ensureTestRouteElement();
  const route = document.createElement(ROUTE_TAG) as AuraRoute;
  route.setAttribute('path', path);
  if (children.length) {
    route.setAttribute('layout', 'test-shell');
    for (const child of children) {
      route.appendChild(child);
    }
  } else {
    route.setAttribute('view', 'html::<span/>');
  }
  return route;
}

export function collectRoutesFromDom(...roots: AuraRoute[]): AuraRoute[] {
  const routes: AuraRoute[] = [];

  function walk(route: AuraRoute): void {
    routes.push(route);
    for (const child of route.querySelectorAll(`:scope > ${ROUTE_TAG}`)) {
      walk(child as AuraRoute);
    }
  }

  for (const root of roots) walk(root);
  return routes;
}

export function buildTreeFromDom(...roots: AuraRoute[]) {
  return buildRouteTree(collectRoutesFromDom(...roots));
}

export { ROUTE_TAG };

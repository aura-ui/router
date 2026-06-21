import type { AURARoute } from '../../../aura-route/core/aura-route';
import { createTestRoute } from '../providers/create-test-route';
import { buildRouteTree } from '../../core/nodes-tree/build-route-tree';

class TestRoute extends HTMLElement {
  path = '';
}

const ROUTE_TAG = 'aura-route';

function ensureTestRouteElement(): void {
  if (!customElements.get(ROUTE_TAG)) {
    customElements.define(ROUTE_TAG, TestRoute);
  }
}

export function createDomRoute(path: string, children: TestRoute[] = []): TestRoute {
  ensureTestRouteElement();
  const route = document.createElement(ROUTE_TAG) as TestRoute;
  route.path = path;
  route.setAttribute('path', path);
  for (const child of children) {
    route.appendChild(child);
  }
  return route;
}

export function collectRoutesFromDom(...roots: TestRoute[]): AURARoute[] {
  const routes: AURARoute[] = [];

  function walk(route: TestRoute): void {
    routes.push(route as unknown as AURARoute);
    for (const child of route.querySelectorAll(`:scope > ${ROUTE_TAG}`)) {
      walk(child as TestRoute);
    }
  }

  for (const root of roots) walk(root);
  return routes;
}

export function buildTreeFromDom(...roots: TestRoute[]) {
  return buildRouteTree(collectRoutesFromDom(...roots));
}

export { TestRoute, ROUTE_TAG };

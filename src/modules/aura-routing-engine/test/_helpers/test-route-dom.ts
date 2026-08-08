import { AuraRoute } from '../../../aura-route/core/aura-route';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
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

/** Nested prefix without `layout` — path group (params / join only). */
export function createDomPathGroup(path: string, children: AuraRoute[]): AuraRoute {
  ensureTestRouteElement();
  const route = document.createElement(ROUTE_TAG) as AuraRoute;
  route.setAttribute('path', path);
  for (const child of children) {
    route.appendChild(child);
  }
  return route;
}

export function createDomRedirectRoute(path: string, redirect: string): AuraRoute {
  ensureTestRouteElement();
  const route = document.createElement(ROUTE_TAG) as AuraRoute;
  route.setAttribute('path', path);
  route.setAttribute('redirect', redirect);
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

/** Match `pathname` against a DOM-built route tree. */
export function matchDomPath(
  matcher: AuraRoutingUrlMatcher,
  pathname: string,
  ...roots: AuraRoute[]
): MatchedRouteInfo {
  const { matchableNodes } = buildTreeFromDom(...roots);
  const found = matcher.matchPath(pathname, matchableNodes);
  if (!found) throw new Error(`No match for ${pathname}`);
  return matcher.buildMatchedRouteInfo(
    pathname,
    pathname,
    '',
    '',
    found.node,
    found.params,
  );
}

export { ROUTE_TAG };

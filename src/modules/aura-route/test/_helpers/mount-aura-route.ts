import { AuraRoute } from '../../core/aura-route';

export type MountAuraRouteOptions = {
  parent?: ParentNode;
  innerHTML?: string;
};

function buildAuraRoute(
  attrs: Record<string, string> = {},
  innerHTML = '',
): AuraRoute {
  const el = document.createElement(AuraRoute.is) as AuraRoute;
  el.setAttribute('path', attrs.path ?? '/');

  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'path') continue;
    el.setAttribute(name, value);
  }

  if (innerHTML) {
    el.innerHTML = innerHTML;
  }

  return el;
}

/** Detached `<aura-route>` — attr/getter checks without DOM connect. */
export function createAuraRoute(
  attrs: Record<string, string> = {},
  options: { innerHTML?: string } = {},
): AuraRoute {
  return buildAuraRoute(attrs, options.innerHTML);
}

/** Create `<aura-route>` and append to `parent` (default: `document.body`). */
export function mountAuraRoute(
  attrs: Record<string, string> = {},
  options: MountAuraRouteOptions = {},
): AuraRoute {
  const el = buildAuraRoute(attrs, options.innerHTML);
  (options.parent ?? document.body).append(el);
  return el;
}

/** Nest `<aura-route>` under `<aura-router>` and append the router to `document.body`. */
export function mountAuraRouteUnderRouter(
  routeAttrs: Record<string, string> = {},
  routerAttrs: Record<string, string> = {},
  options: { innerHTML?: string } = {},
): AuraRoute {
  const router = document.createElement('aura-router');
  for (const [name, value] of Object.entries(routerAttrs)) {
    router.setAttribute(name, value);
  }

  const route = mountAuraRoute(routeAttrs, { parent: router, innerHTML: options.innerHTML });
  document.body.append(router);
  return route;
}

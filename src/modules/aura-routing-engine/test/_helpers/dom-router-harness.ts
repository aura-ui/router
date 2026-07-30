import { AuraRoute } from '../../../aura-route/core/aura-route';
import { AuraRouter } from '../../../aura-router/core/aura-router';
import { installAuraRouter } from '../../../aura-router/core/install';
import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { buildRouteTree } from '../../core/route-tree/build-route-tree';

import { waitForText } from './jsdom-async';

export type MountDomRouterOptions = {
  /** Optional HTML templates injected into `document.body` before mount. */
  templates?: string;
  routes: AuraRoute[];
  routerAttrs?: Record<string, string>;
  /** Initial navigate after mount (`replace` + no history sync). */
  bootPath?: string;
  /** Wait for this text in `appOutlet` after {@link bootPath}. */
  bootText?: string;
};

/** Install, mount, refresh AuraRouter; optionally boot to a path. */
export async function mountDomRouter(
  options: MountDomRouterOptions,
): Promise<{ router: AuraRouter }> {
  if (options.templates != null) {
    document.body.innerHTML = options.templates;
  }

  installAuraRouter();
  const router = document.createElement(AuraRouter.is) as AuraRouter;
  for (const [name, value] of Object.entries(options.routerAttrs ?? {})) {
    router.setAttribute(name, value);
  }
  router.append(...options.routes);
  document.body.append(router);

  await customElements.whenDefined(AuraRoute.is);
  await Promise.resolve();
  router.refreshRoutes();

  if (options.bootPath != null) {
    router.navigate(options.bootPath, { replace: true, syncHistory: false });
    if (options.bootText != null) {
      await waitForText(router.appOutlet, options.bootText);
    }
  }

  return { router };
}

/** Match `pathname` against the mounted router's live route tree. */
export function matchRouterPath(router: AuraRouter, pathname: string): MatchedRouteInfo {
  const matcher = new AuraRoutingUrlMatcher();
  const tree = buildRouteTree(Array.from(router.routes));
  const hit = matcher.matchPath(pathname, tree.matchableNodes);
  if (!hit) throw new Error(`No match for ${pathname}`);
  return matcher.buildMatchedRouteInfo(pathname, pathname, '', '', hit.node, hit.params);
}

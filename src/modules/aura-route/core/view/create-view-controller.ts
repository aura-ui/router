import type { AuraRoute } from '../aura-route';
import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';

import { RouteContentLoader, resolveRouteContentLoaderService } from '../route-content-loader';
import { defaultRouteViewCache } from './view-cache';
import { AuraRouteViewController } from './view-controller';

export function createAuraRouteViewController(
  route: AuraRoute,
  getDefaultOutlet: () => AuraOutlet,
  getLifecycleToken: () => number = () => 0,
): AuraRouteViewController {
  return new AuraRouteViewController(
    route,
    {
      getDefaultOutlet,
      parentOutlet: (routeInfo) => routeInfo?.node?.parent?.route.childOutlet ?? null,
    },
    new RouteContentLoader(route, resolveRouteContentLoaderService()),
    defaultRouteViewCache,
    getLifecycleToken,
  );
}

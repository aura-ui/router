import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';

import { RouteContentLoader, resolveRouteContentLoaderService } from '../route-content-loader';
import { defaultRouteViewCache } from './view-cache';
import { AuraRouteViewController } from './view-controller';
import type { AuraRouteViewHost } from './view-controller.types';

export function createAuraRouteViewController(
  host: AuraRouteViewHost,
  resolveRootOutlet: () => AuraOutlet,
  getLifecycleToken: () => number = () => 0,
): AuraRouteViewController {
  return new AuraRouteViewController(
    () => ({
      path: host.path,
      layout: host.layout || undefined,
      keepAlive: host.keepAlive,
      loadingTemplate: host.loadingTemplate || undefined,
      errorTemplate: host.errorTemplate || undefined,
    }),
    {
      resolveRootOutlet,
      parentOutlet: (routeInfo) => routeInfo?.node?.parent?.route.childOutlet ?? null,
    },
    new RouteContentLoader(
      () => ({
        path: host.path,
        source: host.source,
        content: host.content,
        cache: host.cache,
      }),
      resolveRouteContentLoaderService(),
    ),
    defaultRouteViewCache,
    getLifecycleToken,
  );
}

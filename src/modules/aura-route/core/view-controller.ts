import type { AuraOutlet, ViewHandle } from '../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo } from '../../aura-route-hooks/core';

/** Router surface required to resolve the root outlet (flat v1). */
export type RouteViewRouter = {
  readonly rootOutlet: AuraOutlet | null;
};

export type RouteViewCommitOptions = {
  router: RouteViewRouter;
  routeInfo?: MatchedRouteInfo;
  content: Node | string;
  signal?: AbortSignal;
};

/**
 * Wires route content into `<aura-outlet>` (flat scenario: always root outlet).
 * Layout / nested outlet — later via `resolveOutlet(routeInfo)`.
 */
export class RouteViewController {
  /** Mount content with `replace` strategy; returns `null` when aborted. */
  static commit(options: RouteViewCommitOptions): ViewHandle | null {
    const outlet = RouteViewController.resolveOutlet(options.router);

    return outlet.apply(options.content, {
      strategy: 'replace',
      key: RouteViewController.viewKey(options.routeInfo),
      signal: options.signal,
    });
  }

  /** Flat v1: root outlet only. */
  static resolveOutlet(router: RouteViewRouter): AuraOutlet {
    const outlet = router.rootOutlet;
    if (!outlet) {
      throw new DOMException(
        '<aura-router> must contain <aura-outlet>',
        'NotFoundError',
      );
    }
    return outlet;
  }

  static viewKey(routeInfo?: MatchedRouteInfo): string | undefined {
    return routeInfo?.routePath;
  }

  /** Teardown after `onLeft`: destroy or detach per `preserveState`. */
  static teardown(handle: ViewHandle | null | undefined, preserveState: boolean): void {
    if (!handle) return;
    if (preserveState) handle.detach();
    else handle.destroy();
  }
}

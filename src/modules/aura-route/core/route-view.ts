import type { AuraOutlet, ViewHandle } from '../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo } from '../../aura-route-hooks/core';

export type RouteMountType = 'layout' | 'content';

/** Result of mounting a route in an outlet (handle + nested outlet after layout). */
export type RouteMountResult = {
  activeHandle: ViewHandle | null;
  resolvedOutlet: AuraOutlet | null;
};

/** Minimal router surface needed to locate the mount outlet. */
export type RouteOutletHost = {
  readonly rootOutlet: AuraOutlet | null;
};

export type RouteMountContext = {
  host: RouteOutletHost;
  routeInfo?: MatchedRouteInfo;
  signal?: AbortSignal;
  /** Layout-only: missing-outlet warning. */
  layoutMeta?: { templateId: string; path: string };
};

/**
 * Outlet mount/unmount for `<aura-route>`.
 * Flat → root outlet; nested child → parent `resolvedOutlet`.
 */
export class RouteView {
  static getMountType(layout?: string | null): RouteMountType {
    return layout ? 'layout' : 'content';
  }

  /** keepAlive + existing mount → skip a full render pass. */
  static shouldSkipRender(
    keepAlive: boolean,
    mountType: RouteMountType,
    mountResult: RouteMountResult,
  ): boolean {
    if (!keepAlive) return false;
    return mountType === 'layout'
      ? !!(mountResult.activeHandle && mountResult.resolvedOutlet)
      : !!mountResult.activeHandle;
  }

  /** Put `content` into resolved outlet; returns updated mount result. */
  static mount(
    ctx: RouteMountContext,
    content: Node | string,
    mountType: RouteMountType,
    mountResult: RouteMountResult,
  ): RouteMountResult {
    const outlet = RouteView.getMountOutlet(ctx.host, ctx.routeInfo);
    const handle = outlet.apply(content, {
      strategy: 'replace',
      key: ctx.routeInfo?.routePath,
      signal: ctx.signal,
    });

    if (!handle) return mountResult;

    if (mountType === 'content') {
      return { activeHandle: handle, resolvedOutlet: mountResult.resolvedOutlet };
    }

    const nestedOutlet = outlet.findNestedOutlet(handle.root);
    if (!nestedOutlet && ctx.layoutMeta) {
      console.warn(
        `AURARoute layout "${ctx.layoutMeta.templateId}" (path: ${ctx.layoutMeta.path}) has no <aura-outlet>`,
      );
    }

    return { activeHandle: handle, resolvedOutlet: nestedOutlet };
  }

  static getMountOutlet(host: RouteOutletHost, routeInfo?: MatchedRouteInfo): AuraOutlet {
    const parentResolvedOutlet = routeInfo?.node?.parent?.route.resolvedOutlet;
    if (parentResolvedOutlet) {
      return RouteView.ensureAuraOutlet(parentResolvedOutlet);
    }
    return RouteView.ensureAuraOutlet(host.rootOutlet);
  }

  /** keepAlive → detach handle (reuse later); otherwise destroy. */
  static unmount(handle: ViewHandle | null | undefined, keepAlive: boolean): void {
    if (!handle) return;
    if (keepAlive) handle.detach();
    else handle.destroy();
  }

  private static ensureAuraOutlet(outlet: Element | null): AuraOutlet {
    if (!outlet) {
      throw new DOMException(
        '<aura-router> must contain <aura-outlet>',
        'NotFoundError',
      );
    }

    if (typeof (outlet as AuraOutlet).apply !== 'function') {
      throw new DOMException(
        '<aura-outlet> is not upgraded — register with customElements.define(AuraOutlet.is, AuraOutlet)',
        'InvalidStateError',
      );
    }

    return outlet as AuraOutlet;
  }
}

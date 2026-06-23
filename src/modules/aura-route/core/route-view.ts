import type { AuraOutlet, ViewHandle } from '../../aura-outlet/core/aura-outlet';
import type { MatchedRouteInfo } from '../../aura-route-hooks/core';

export type RenderMode = 'layout' | 'content';

/** DOM mount state for one route (handle + nested outlet after layout). */
export type RouteMountState = {
  activeHandle: ViewHandle | null;
  resolvedOutlet: AuraOutlet | null;
};

export type RouteViewRouter = {
  readonly rootOutlet: AuraOutlet | null;
};

export type RouteMountContext = {
  router: RouteViewRouter;
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
  static modeFrom(layout?: string | null): RenderMode {
    return layout ? 'layout' : 'content';
  }

  static shouldSkip(preserveState: boolean, mode: RenderMode, state: RouteMountState): boolean {
    if (!preserveState) return false;
    return mode === 'layout'
      ? !!(state.activeHandle && state.resolvedOutlet)
      : !!state.activeHandle;
  }

  /** Put `payload` into resolved outlet; returns updated mount state. */
  static mount(
    ctx: RouteMountContext,
    payload: Node | string,
    mode: RenderMode,
    state: RouteMountState,
  ): RouteMountState {
    const outlet = RouteView.resolveOutlet(ctx.router, ctx.routeInfo);
    const handle = outlet.apply(payload, {
      strategy: 'replace',
      key: ctx.routeInfo?.routePath,
      signal: ctx.signal,
    });

    if (!handle) return state;

    if (mode === 'content') {
      return { activeHandle: handle, resolvedOutlet: state.resolvedOutlet };
    }

    const nestedOutlet = outlet.findNestedOutlet(handle.root);
    if (!nestedOutlet && ctx.layoutMeta) {
      console.warn(
        `AURARoute layout "${ctx.layoutMeta.templateId}" (path: ${ctx.layoutMeta.path}) has no <aura-outlet>`,
      );
    }

    return { activeHandle: handle, resolvedOutlet: nestedOutlet };
  }

  static resolveOutlet(router: RouteViewRouter, routeInfo?: MatchedRouteInfo): AuraOutlet {
    const parentOutlet = routeInfo?.node?.parent?.route.resolvedOutlet;
    if (parentOutlet) {
      return RouteView.assertAuraOutlet(parentOutlet);
    }
    return RouteView.assertAuraOutlet(router.rootOutlet);
  }

  static unmount(handle: ViewHandle | null | undefined, preserveState: boolean): void {
    if (!handle) return;
    if (preserveState) handle.detach();
    else handle.destroy();
  }

  private static assertAuraOutlet(outlet: Element | null): AuraOutlet {
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

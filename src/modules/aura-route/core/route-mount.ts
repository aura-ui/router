import type { AuraOutlet, ViewHandle } from '../../aura-outlet/core/aura-outlet';

export type RouteMountType = 'layout' | 'content';

/** Result of mounting a route in an outlet (handle + slot for child routes). */
export type RouteMountResult = {
  activeHandle: ViewHandle | null;
  /** Nested `<aura-outlet>` inside mounted view; null when route exposes no child slot. */
  resolvedOutlet: AuraOutlet | null;
};

export type RouteMountContext = {
  appOutlet: AuraOutlet;
  /** Outlet apply key; omitted → cleared on the view root. */
  routePath?: string;
  /** Parent layout's `resolvedOutlet`; flat routes omit and fall back to `appOutlet`. */
  parentResolvedOutlet?: AuraOutlet | null;
  signal?: AbortSignal;
};

/**
 * Outlet mount/unmount for `<aura-route>`.
 * Flat → root outlet; nested child → parent `resolvedOutlet`.
 */
export class RouteMount {
  /** keepAlive + existing mount → skip a full render pass. */
  static shouldSkipRender(
    keepAlive: boolean,
    mountType: RouteMountType,
    prevMountResult: RouteMountResult,
  ): boolean {
    return keepAlive && this.isPrevMountActive(mountType, prevMountResult);
  }

  private static isPrevMountActive(mountType: RouteMountType, prevMountResult: RouteMountResult) {
    return mountType === 'layout'
      ? !!(prevMountResult.activeHandle && prevMountResult.resolvedOutlet)
      : !!prevMountResult.activeHandle;
  }

  /** Put `content` into resolved outlet; returns updated mount result. */
  static mount(
    ctx: RouteMountContext,
    content: Node | string,
    prevMountResult: RouteMountResult,
  ): RouteMountResult {
    const mountOutlet = this.ensureAuraOutlet(ctx.parentResolvedOutlet ?? ctx.appOutlet);
    const handle = mountOutlet.apply(content, {
      strategy: 'replace',
      key: ctx.routePath,
      signal: ctx.signal,
    });

    if (!handle) return prevMountResult;

    return {
      activeHandle: handle,
      resolvedOutlet: handle.findChildOutlet(),
    };
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

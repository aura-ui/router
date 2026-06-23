import type { AuraOutlet, OutletStrategy, ViewHandle } from '../../aura-outlet/core/aura-outlet';

export type RouteMountType = 'layout' | 'content';

/** Result of mounting a route in an outlet (handle + slot for child routes). */
export type RouteMountResult = {
  activeHandle: ViewHandle | null;
  /** Nested `<aura-outlet>` inside mounted view; null when route exposes no child slot. */
  resolvedOutlet: AuraOutlet | null;
};

export const EMPTY_MOUNT: RouteMountResult = {
  activeHandle: null,
  resolvedOutlet: null,
};

export type RouteMountContext = {
  appOutlet: AuraOutlet;
  /** Outlet apply key; omitted → cleared on the view root. */
  routePath?: string;
  /** Parent layout's `resolvedOutlet`; flat routes omit and fall back to `appOutlet`. */
  parentResolvedOutlet?: AuraOutlet | null;
  signal?: AbortSignal;
  /** Defaults to `replace`; `stage` for transition flows. */
  strategy?: Extract<OutletStrategy, 'replace' | 'stage'>;
};

export type RouteMountRequest = {
  ctx: RouteMountContext;
  content: Node | string;
  previous: RouteMountResult;
};

type MountSkipPolicy = (prev: RouteMountResult) => boolean;

const MOUNT_SKIP_POLICIES: Record<RouteMountType, MountSkipPolicy> = {
  content: (prev) => !!prev.activeHandle,
  layout: (prev) => !!(prev.activeHandle && prev.resolvedOutlet),
};

function resolveTargetOutlet(ctx: RouteMountContext): AuraOutlet {
  return ensureAuraOutlet(ctx.parentResolvedOutlet ?? ctx.appOutlet);
}

function toMountResult(handle: ViewHandle): RouteMountResult {
  return {
    activeHandle: handle,
    resolvedOutlet: handle.findChildOutlet(),
  };
}

function ensureAuraOutlet(outlet: Element | null): AuraOutlet {
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
    return keepAlive && MOUNT_SKIP_POLICIES[mountType](prevMountResult);
  }

  /** Put `content` into resolved outlet; returns updated mount result. */
  static mount(request: RouteMountRequest): RouteMountResult {
    const { ctx, content, previous } = request;
    const mountOutlet = resolveTargetOutlet(ctx);
    const handle = mountOutlet.apply(content, {
      strategy: ctx.strategy ?? 'replace',
      key: ctx.routePath,
      signal: ctx.signal,
    });

    if (!handle) return previous;

    return toMountResult(handle);
  }

  /** keepAlive → detach handle (reuse later); otherwise destroy. */
  static unmount(handle: ViewHandle | null | undefined, keepAlive: boolean): void {
    if (!handle) return;
    if (keepAlive) handle.detach();
    else handle.destroy();
  }
}

import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../aura-outlet/core/aura-outlet';

export type RouteMountType = 'layout' | 'content';

/** Result of mounting a route in an outlet (handle + slot for child routes). */
export type RouteMountResult = {
  activeHandle: ViewHandle | null;
  /** Nested `<aura-outlet>` inside mounted view; null when route exposes no child slot. */
  resolvedOutlet: AuraOutlet | null;
  /** Detached view kept for keepAlive re-attach; cleared after remount. */
  detachedRoot: ViewRoot | null;
  /** Strategy applied by the last {@link mountRoute} call. */
  appliedStrategy?: Extract<OutletStrategy, 'replace' | 'stage'>;
};

export const EMPTY_MOUNT: RouteMountResult = {
  activeHandle: null,
  resolvedOutlet: null,
  detachedRoot: null,
};

export type RouteMountContext = {
  appOutlet: AuraOutlet;
  /** Outlet apply key; omitted → cleared on the view root. */
  routePath?: string;
  /** Parent layout's `resolvedOutlet`; flat routes omit and fall back to `appOutlet`. */
  parentResolvedOutlet?: AuraOutlet | null;
  signal?: AbortSignal;
  /** Defaults via {@link resolveMountStrategy}; explicit value wins. */
  strategy?: Extract<OutletStrategy, 'replace' | 'stage'>;
  /**
   * When `out-in` / `in-out`, stage into a non-empty outlet so exit views stay until
   * {@link commitStagedMount} runs after transition-in.
   */
  transitionPolicy?: 'out-in' | 'in-out' | 'parallel';
};

export type RouteMountRequest = {
  ctx: RouteMountContext;
  content: Node | string;
  previous: RouteMountResult;
};

export type RouteUnmountRequest = {
  handle: ViewHandle | null | undefined;
  keepAlive: boolean;
};

function isPrevMountActive(requiresChildOutlet: boolean, prev: RouteMountResult): boolean {
  return requiresChildOutlet
    ? !!(prev.activeHandle && prev.resolvedOutlet)
    : !!prev.activeHandle;
}

/** keepAlive + valid active mount → skip a full render pass. Detached roots always re-attach. */
export function shouldSkipRouteRender(
  keepAlive: boolean,
  requiresChildOutlet: boolean,
  prev: RouteMountResult,
): boolean {
  if (!keepAlive || prev.detachedRoot) return false;
  return isPrevMountActive(requiresChildOutlet, prev);
}

export function resolveMountStrategy(
  ctx: RouteMountContext,
  previous: RouteMountResult,
): Extract<OutletStrategy, 'replace' | 'stage'> {
  if (previous.detachedRoot) return 'replace';
  if (ctx.strategy) return ctx.strategy;

  const policy = ctx.transitionPolicy;
  if (policy !== 'out-in' && policy !== 'in-out') return 'replace';

  const outlet = resolveTargetOutlet(ctx);
  return outlet.children.length > 0 ? 'stage' : 'replace';
}

/** Put `content` into resolved outlet; re-attaches `previous.detachedRoot` when present. */
export function mountRoute(request: RouteMountRequest): RouteMountResult {
  const { ctx, content, previous } = request;

  if (ctx.signal?.aborted) return previous;

  const mountOutlet = resolveTargetOutlet(ctx);
  const strategy = resolveMountStrategy(ctx, previous);
  const payload = previous.detachedRoot ?? content;

  const handle = mountOutlet.apply(payload, {
    strategy,
    key: ctx.routePath,
    signal: ctx.signal,
  });

  if (!handle) return previous;

  return {
    ...toMountResult(handle),
    detachedRoot: null,
    appliedStrategy: strategy,
  };
}

/** keepAlive → detach and return root; otherwise destroy. */
export function unmountRoute(request: RouteUnmountRequest): ViewRoot | null {
  const { handle, keepAlive } = request;
  if (!handle) return null;
  if (keepAlive) return handle.detach();
  handle.destroy();
  return null;
}

/** Finalize a staged mount after transition-in (no-op for replace). */
export function commitStagedMount(result: RouteMountResult): void {
  const handle = result.activeHandle;
  if (!handle) return;
  handle.mountOutlet.commitStage(handle.viewRoot);
}

function resolveTargetOutlet(ctx: RouteMountContext): AuraOutlet {
  return ensureAuraOutlet(ctx.parentResolvedOutlet ?? ctx.appOutlet);
}

function toMountResult(handle: ViewHandle): Pick<RouteMountResult, 'activeHandle' | 'resolvedOutlet'> {
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

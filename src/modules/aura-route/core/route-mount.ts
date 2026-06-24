import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../aura-outlet/core/aura-outlet';
import type { TransitionPolicy } from '../../aura-routing-engine/core/transition/policy';

type MountStrategy = Extract<OutletStrategy, 'replace' | 'stage'>;

/** Last mount state for one route (handle, child slot, optional keepAlive cache). */
export type RouteMountResult = {
  activeHandle: ViewHandle | null;
  /** Nested `<aura-outlet>` in a layout view; null for content-only routes. */
  resolvedOutlet: AuraOutlet | null;
  /** Detached view for keepAlive; cleared after re-mount. */
  detachedRoot: ViewRoot | null;
  appliedStrategy?: MountStrategy;
};

export const EMPTY_MOUNT: RouteMountResult = {
  activeHandle: null,
  resolvedOutlet: null,
  detachedRoot: null,
};

export type RouteMountContext = {
  /** Router root outlet — fallback when `parentOutlet` is omitted. */
  rootOutlet: AuraOutlet;
  /** Parent layout's `resolvedOutlet`; nested routes set this. */
  parentOutlet?: AuraOutlet | null;
  routePath?: string;
  signal?: AbortSignal;
  strategy?: MountStrategy;
  transitionPolicy?: TransitionPolicy;
};

function hasActiveMount(isLayout: boolean, prev: RouteMountResult): boolean {
  return isLayout
    ? !!(prev.activeHandle && prev.resolvedOutlet)
    : !!prev.activeHandle;
}

/** keepAlive + live mount → skip reload. Detached roots always go through re-mount. */
export function shouldSkipRouteRender(
  keepAlive: boolean,
  isLayout: boolean,
  prev: RouteMountResult,
): boolean {
  if (!keepAlive || prev.detachedRoot) return false;
  return hasActiveMount(isLayout, prev);
}

export function resolveMountStrategy(
  ctx: RouteMountContext,
  prev: RouteMountResult,
  targetOutlet: AuraOutlet,
): MountStrategy {
  if (prev.detachedRoot) return 'replace';
  if (ctx.strategy) return ctx.strategy;

  const policy = ctx.transitionPolicy;
  if (policy !== 'out-in' && policy !== 'in-out') return 'replace';

  return targetOutlet.children.length > 0 ? 'stage' : 'replace';
}

/** Mount `content` into the resolved outlet; re-uses `prev.detachedRoot` when present. */
export function mountRoute(
  ctx: RouteMountContext,
  content: Node | string,
  prev: RouteMountResult = EMPTY_MOUNT,
): RouteMountResult {
  if (ctx.signal?.aborted) return prev;

  const outlet = resolveTargetOutlet(ctx);
  const strategy = resolveMountStrategy(ctx, prev, outlet);
  const payload = prev.detachedRoot ?? content;

  const handle = outlet.apply(payload, {
    strategy,
    key: ctx.routePath,
    signal: ctx.signal,
  });

  if (!handle) return prev;

  return {
    activeHandle: handle,
    resolvedOutlet: handle.findChildOutlet(),
    detachedRoot: null,
    appliedStrategy: strategy,
  };
}

/** keepAlive → detach; otherwise destroy. Returns detached root or null. */
export function unmountRoute(
  handle: ViewHandle | null | undefined,
  keepAlive: boolean,
): ViewRoot | null {
  if (!handle) return null;
  if (keepAlive) return handle.detach();
  handle.destroy();
  return null;
}

/** Commit staged view after transition-in. */
export function commitStagedMount(mount: RouteMountResult): void {
  const handle = mount.activeHandle;
  if (!handle) return;
  handle.mountOutlet.commitStage(handle.viewRoot);
}

function resolveTargetOutlet(ctx: RouteMountContext): AuraOutlet {
  return asAuraOutlet(ctx.parentOutlet ?? ctx.rootOutlet);
}

function asAuraOutlet(outlet: Element | null): AuraOutlet {
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

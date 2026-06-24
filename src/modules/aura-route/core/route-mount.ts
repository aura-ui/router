import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../aura-outlet/core/aura-outlet';
import type { TransitionPolicy } from '../../aura-routing-engine/core/transition/policy';

type MountStrategy = Extract<OutletStrategy, 'replace' | 'stage'>;

export type RouteMountResult = {
  activeHandle: ViewHandle | null;
  resolvedOutlet: AuraOutlet | null;
  detachedRoot: ViewRoot | null;
  appliedStrategy?: MountStrategy;
};

export const EMPTY_MOUNT: RouteMountResult = {
  activeHandle: null,
  resolvedOutlet: null,
  detachedRoot: null,
};

export type RouteMountContext = {
  rootOutlet: AuraOutlet;
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

/** keepAlive with an active view — skip reload (not when re-attaching detached root). */
export function shouldSkipRouteRender(
  keepAlive: boolean,
  isLayout: boolean,
  prev: RouteMountResult,
): boolean {
  if (!keepAlive || prev.detachedRoot) return false;
  return hasActiveMount(isLayout, prev);
}

/** `stage` when out-in/in-out and outlet already has a view; else `replace`. */
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

/** Put content into `parentOutlet ?? rootOutlet`; uses `prev.detachedRoot` when set. */
export function mountRoute(
  ctx: RouteMountContext,
  content: Node | string,
  prev: RouteMountResult = EMPTY_MOUNT,
): RouteMountResult {
  if (ctx.signal?.aborted) return prev;

  const outlet = asAuraOutlet(ctx.parentOutlet ?? ctx.rootOutlet);
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

/** keepAlive: detach view; otherwise destroy. */
export function unmountRoute(
  handle: ViewHandle | null | undefined,
  keepAlive: boolean,
): ViewRoot | null {
  if (!handle) return null;
  if (keepAlive) return handle.detach();
  handle.destroy();
  return null;
}

/** Swap staged view in after transition-in. */
export function commitStagedMount(mount: RouteMountResult): void {
  const handle = mount.activeHandle;
  if (!handle) return;
  handle.mountOutlet.commitStage(handle.viewRoot);
}

/** Assert element is an upgraded `<aura-outlet>`. */
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

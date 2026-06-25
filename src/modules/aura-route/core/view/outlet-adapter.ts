import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../../aura-outlet/core/aura-outlet';

type MountStrategy = Extract<OutletStrategy, 'replace' | 'stage'>;

/** Snapshot of the mounted view inside an outlet (handle, nested slot, optional detached root). */
export type ViewMountState = {
  activeHandle: ViewHandle | null;
  childOutlet: AuraOutlet | null;
  detachedRoot: ViewRoot | null;
  appliedStrategy?: MountStrategy;
};

export const EMPTY_VIEW_MOUNT: ViewMountState = {
  activeHandle: null,
  childOutlet: null,
  detachedRoot: null,
};

/** Inputs for {@link mountRoute}: outlets, pattern key, signal, stage flag. */
export type ViewMountContext = {
  defaultOutlet: AuraOutlet;
  parentOutlet?: AuraOutlet | null;
  pattern?: string;
  signal?: AbortSignal;
  strategy?: MountStrategy;
  /** Staged crossfade when true (inherited `<aura-router data-transition>`). */
  stageMount?: boolean;
};

function hasActiveMount(isLayout: boolean, prev: ViewMountState): boolean {
  return isLayout
    ? !!(prev.activeHandle && prev.childOutlet)
    : !!prev.activeHandle;
}

/** keepAlive with an active view — skip reload (not when re-attaching detached root). */
export function shouldSkipRouteRender(
  keepAlive: boolean,
  isLayout: boolean,
  prev: ViewMountState,
): boolean {
  if (!keepAlive || prev.detachedRoot) return false;
  return hasActiveMount(isLayout, prev);
}

/**
 * `stage` when `stageMount` and outlet already has a view; else `replace`.
 * Phase order comes from `<aura-router data-transition>`, not from this flag.
 */
export function resolveMountStrategy(
  ctx: ViewMountContext,
  prev: ViewMountState,
  targetOutlet: AuraOutlet,
): MountStrategy {
  if (prev.detachedRoot) return 'replace';
  if (ctx.strategy) return ctx.strategy;
  if (!ctx.stageMount) return 'replace';

  return targetOutlet.children.length > 0 ? 'stage' : 'replace';
}

/** Put content into `parentOutlet ?? defaultOutlet`; uses `prev.detachedRoot` when set. */
export function mountRoute(
  ctx: ViewMountContext,
  content: Node | string,
  prev: ViewMountState = EMPTY_VIEW_MOUNT,
): ViewMountState {
  if (ctx.signal?.aborted) return prev;

  const outlet = asAuraOutlet(ctx.parentOutlet ?? ctx.defaultOutlet);
  const strategy = resolveMountStrategy(ctx, prev, outlet);
  const payload = prev.detachedRoot ?? content;

  const handle = outlet.apply(payload, {
    strategy,
    key: ctx.pattern,
    signal: ctx.signal,
  });

  if (!handle) return prev;

  return {
    activeHandle: handle,
    childOutlet: handle.findChildOutlet(),
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

import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../../aura-outlet/core/aura-outlet';

type MountStrategy = Extract<OutletStrategy, 'replace' | 'stage'>;

/** Snapshot of the mounted view inside an outlet (handle and nested slot). */
export type ViewMountState = {
  activeHandle: ViewHandle | null;
  nestedOutlet: AuraOutlet | null;
  appliedStrategy?: MountStrategy;
};

export const EMPTY_VIEW_MOUNT: ViewMountState = {
  activeHandle: null,
  nestedOutlet: null,
};

/** Inputs for {@link mountRoute}: outlets, pattern key, signal, stage flag. */
export type ViewMountContext = {
  appOutlet: AuraOutlet;
  mountOutlet?: AuraOutlet | null;
  pattern?: string;
  signal?: AbortSignal;
  strategy?: MountStrategy;
  /** Staged crossfade when true (inherited `<aura-router data-transition>`). */
  stageMount?: boolean;
};

/** Whether a route view is already mounted (layout routes require a nested outlet). */
export function hasActiveMount(isLayout: boolean, prev: ViewMountState): boolean {
  return !!prev.activeHandle && (!isLayout || !!prev.nestedOutlet);
}

/**
 * `stage` when `stageMount` and outlet already has a view; else `replace`.
 * Phase order comes from `<aura-router data-transition>`, not from this flag.
 */
export function resolveMountStrategy(ctx: ViewMountContext, targetOutlet: AuraOutlet): MountStrategy {
  if (ctx.strategy) return ctx.strategy;
  if (!ctx.stageMount) return 'replace';

  return targetOutlet.children.length > 0 ? 'stage' : 'replace';
}

/** Mount new content into `mountOutlet ?? appOutlet`. */
export function mountRoute(
  ctx: ViewMountContext,
  content: Node | string,
  prev: ViewMountState = EMPTY_VIEW_MOUNT,
): ViewMountState {
  if (ctx.signal?.aborted) return prev;

  const outlet = resolveTargetOutlet(ctx);
  const result = applyInOutlet(outlet, ctx, content, resolveMountStrategy(ctx, outlet));

  return result ?? prev;
}

/** Re-insert a detached keep-alive root from view cache (always replace). */
export function reattachRoute(
  ctx: ViewMountContext,
  cachedRoot: ViewRoot,
): ViewMountState | null {
  if (ctx.signal?.aborted) return null;

  return applyInOutlet(resolveTargetOutlet(ctx), ctx, cachedRoot, 'replace');
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

/** Stage/replace mount snapshot tracked by {@link AuraRouteViewController}. */
export type RouteMountSnapshot = {
  strategy: MountStrategy;
  activeHandle: ViewHandle | null;
  stageOutgoingHandle: ViewHandle | null;
  nestedOutlet: AuraOutlet | null;
};

export const EMPTY_ROUTE_MOUNT: RouteMountSnapshot = {
  strategy: 'replace',
  activeHandle: null,
  stageOutgoingHandle: null,
  nestedOutlet: null,
};

export function toViewMountState(snapshot: RouteMountSnapshot): ViewMountState {
  return {
    activeHandle: snapshot.activeHandle,
    nestedOutlet: snapshot.nestedOutlet,
  };
}

/** Apply a mount/reattach result and preserve outgoing handle when staging. */
export function mergeMountResult(
  prev: RouteMountSnapshot,
  result: ViewMountState,
): RouteMountSnapshot {
  return {
    strategy: result.appliedStrategy ?? 'replace',
    activeHandle: result.activeHandle,
    stageOutgoingHandle: result.appliedStrategy === 'stage' ? prev.activeHandle : null,
    nestedOutlet: result.nestedOutlet,
  };
}

/** Promote staged incoming view to the sole active root in the outlet. */
export function commitStagedMount(state: RouteMountSnapshot): RouteMountSnapshot {
  if (state.strategy !== 'stage' || !state.activeHandle) return state;

  state.activeHandle.mountOutlet.commitStage(state.activeHandle.viewRoot);

  return {
    ...state,
    strategy: 'replace',
    stageOutgoingHandle: null,
  };
}

/** Remove staged DOM only; does not restore handles. */
export function cancelStagedMountDom(state: RouteMountSnapshot): RouteMountSnapshot {
  if (state.strategy !== 'stage' || !state.activeHandle) return state;

  state.activeHandle.mountOutlet.cancelStage();

  return {
    ...state,
    strategy: 'replace',
  };
}

/** Cancel pending stage and restore the outgoing view as active. */
export function rollbackStagedMount(state: RouteMountSnapshot): RouteMountSnapshot {
  if (state.strategy !== 'stage' || !state.activeHandle) return state;

  const dropped = cancelStagedMountDom(state);
  const outgoing = dropped.stageOutgoingHandle;

  return {
    strategy: 'replace',
    activeHandle: outgoing,
    stageOutgoingHandle: null,
    nestedOutlet: outgoing?.findChildOutlet() ?? null,
  };
}

export type LeaveUnmountResult = {
  state: RouteMountSnapshot;
  detached: ViewRoot | null;
};

/** Unmount the leaving route view; cancels staged DOM first when needed. */
export function unmountMountOnLeave(
  state: RouteMountSnapshot,
  keepAlive: boolean,
): LeaveUnmountResult {
  if (state.strategy === 'stage') {
    const dropped = cancelStagedMountDom(state);

    return {
      detached: unmountRoute(dropped.stageOutgoingHandle, keepAlive),
      state: {
        ...dropped,
        activeHandle: null,
        stageOutgoingHandle: null,
      },
    };
  }

  return {
    detached: unmountRoute(state.activeHandle, keepAlive),
    state: {
      ...state,
      activeHandle: null,
    },
  };
}

/** Clear nested outlet unless the detached view is stashed for keep-alive. */
export function finalizeLeaveMount(
  state: RouteMountSnapshot,
  keepAlive: boolean,
  detached: ViewRoot | null,
): RouteMountSnapshot {
  return keepAlive && detached ? state : { ...state, nestedOutlet: null };
}

function applyInOutlet(
  outlet: AuraOutlet,
  ctx: ViewMountContext,
  content: Node | string | ViewRoot,
  strategy: MountStrategy,
): ViewMountState | null {
  const handle = outlet.apply(content, {
    strategy,
    key: ctx.pattern,
    signal: ctx.signal,
  });

  if (!handle) return null;

  return {
    activeHandle: handle,
    nestedOutlet: handle.findChildOutlet(),
    appliedStrategy: strategy,
  };
}

function resolveTargetOutlet(ctx: ViewMountContext): AuraOutlet {
  return asAuraOutlet(ctx.mountOutlet ?? ctx.appOutlet);
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

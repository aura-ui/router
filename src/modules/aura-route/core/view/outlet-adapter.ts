import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../../aura-outlet/core/aura-outlet';

type MountStrategy = Extract<OutletStrategy, 'replace' | 'stage'>;

/** Result of a single outlet apply: active handle, nested slot, strategy used. */
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
  useStagedMount?: boolean;
};

/** Whether a route view is already mounted (layout routes require a nested outlet). */
export function hasActiveMount(mount: ViewMountState, isLayoutRoute: boolean): boolean {
  return !!mount.activeHandle && (!isLayoutRoute || !!mount.nestedOutlet);
}

/**
 * `stage` when `useStagedMount` and outlet already has a view; else `replace`.
 * Phase order comes from `<aura-router data-transition>`, not from this flag.
 */
export function resolveMountStrategy(
  mountContext: ViewMountContext,
  targetOutlet: AuraOutlet,
): MountStrategy {
  if (mountContext.strategy) return mountContext.strategy;
  if (!mountContext.useStagedMount) return 'replace';

  return targetOutlet.children.length > 0 ? 'stage' : 'replace';
}

/** Mount new content into `mountOutlet ?? appOutlet`. */
export function mountRoute(
  mountContext: ViewMountContext,
  viewContent: Node | string,
  currentMount: ViewMountState = EMPTY_VIEW_MOUNT,
): ViewMountState {
  if (mountContext.signal?.aborted) return currentMount;

  const outlet = resolveTargetOutlet(mountContext);
  const mountResult = applyInOutlet(
    outlet,
    mountContext,
    viewContent,
    resolveMountStrategy(mountContext, outlet),
  );

  return mountResult ?? currentMount;
}

/** Re-insert a detached keep-alive root from view cache (always replace). */
export function reattachRoute(
  mountContext: ViewMountContext,
  cachedRoot: ViewRoot,
): ViewMountState | null {
  if (mountContext.signal?.aborted) return null;

  return applyInOutlet(resolveTargetOutlet(mountContext), mountContext, cachedRoot, 'replace');
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

/** Projection of {@link RouteMountSnapshot} for outlet apply helpers. */
export function toViewMountState(snapshot: RouteMountSnapshot): ViewMountState {
  return {
    activeHandle: snapshot.activeHandle,
    nestedOutlet: snapshot.nestedOutlet,
  };
}

/** Fold an outlet apply result into the route mount snapshot. */
export function mergeMountSnapshot(
  snapshot: RouteMountSnapshot,
  mountResult: ViewMountState,
): RouteMountSnapshot {
  return {
    strategy: mountResult.appliedStrategy ?? 'replace',
    activeHandle: mountResult.activeHandle,
    stageOutgoingHandle: mountResult.appliedStrategy === 'stage' ? snapshot.activeHandle : null,
    nestedOutlet: mountResult.nestedOutlet,
  };
}

/** Promote staged incoming view to the sole active root in the outlet. */
export function commitStagedMount(snapshot: RouteMountSnapshot): RouteMountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  snapshot.activeHandle.mountOutlet.commitStage(snapshot.activeHandle.viewRoot);

  return {
    ...snapshot,
    strategy: 'replace',
    stageOutgoingHandle: null,
  };
}

/** Drop staged incoming DOM via `cancelStage`; does not restore outgoing handle. */
export function cancelStagedIncoming(snapshot: RouteMountSnapshot): RouteMountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  snapshot.activeHandle.mountOutlet.cancelStage();

  return {
    ...snapshot,
    strategy: 'replace',
  };
}

/** Cancel pending stage and restore the outgoing view as active. */
export function rollbackStagedMount(snapshot: RouteMountSnapshot): RouteMountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  const afterStageCancel = cancelStagedIncoming(snapshot);
  const outgoingHandle = afterStageCancel.stageOutgoingHandle;

  return {
    strategy: 'replace',
    activeHandle: outgoingHandle,
    stageOutgoingHandle: null,
    nestedOutlet: outgoingHandle?.findChildOutlet() ?? null,
  };
}

export type RouteLeaveUnmountResult = {
  snapshot: RouteMountSnapshot;
  detachedRoot: ViewRoot | null;
};

/** Unmount the leaving route view; cancels staged incoming DOM first when needed. */
export function unmountOnLeave(
  snapshot: RouteMountSnapshot,
  keepAlive: boolean,
): RouteLeaveUnmountResult {
  if (snapshot.strategy === 'stage') {
    const afterStageCancel = cancelStagedIncoming(snapshot);

    return {
      detachedRoot: unmountRoute(afterStageCancel.stageOutgoingHandle, keepAlive),
      snapshot: {
        ...afterStageCancel,
        activeHandle: null,
        stageOutgoingHandle: null,
      },
    };
  }

  return {
    detachedRoot: unmountRoute(snapshot.activeHandle, keepAlive),
    snapshot: {
      ...snapshot,
      activeHandle: null,
    },
  };
}

/** Clear nested outlet unless the detached view is stashed for keep-alive. */
export function finalizeLeaveMount(
  snapshot: RouteMountSnapshot,
  keepAlive: boolean,
  detachedRoot: ViewRoot | null,
): RouteMountSnapshot {
  return keepAlive && detachedRoot ? snapshot : { ...snapshot, nestedOutlet: null };
}

function applyInOutlet(
  outlet: AuraOutlet,
  mountContext: ViewMountContext,
  viewContent: Node | string | ViewRoot,
  strategy: MountStrategy,
): ViewMountState | null {
  const handle = outlet.apply(viewContent, {
    strategy,
    key: mountContext.pattern,
    signal: mountContext.signal,
  });

  if (!handle) return null;

  return {
    activeHandle: handle,
    nestedOutlet: handle.findChildOutlet(),
    appliedStrategy: strategy,
  };
}

function resolveTargetOutlet(mountContext: ViewMountContext): AuraOutlet {
  return asAuraOutlet(mountContext.mountOutlet ?? mountContext.appOutlet);
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

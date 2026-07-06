import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface } from '../types';
import type { ViewKind } from './types';

type StageStrategy = Extract<OutletStrategy, 'replace' | 'stage'>;

export type MountContext = {
  appOutlet: AuraOutlet;
  mountOutlet: AuraOutlet | null;
  pattern?: string;
  signal?: AbortSignal;
  strategy?: StageStrategy;
  /** True when the route declares a transition policy — incoming view stages in the outlet. */
  useStagedMount?: boolean;
};

export type MountSlice = {
  activeHandle: ViewHandle | null;
  nestedOutlet: AuraOutlet | null;
  appliedStrategy: StageStrategy;
};

export type MountSnapshot = {
  strategy: StageStrategy;
  activeHandle: ViewHandle | null;
  stageOutgoingHandle: ViewHandle | null;
  nestedOutlet: AuraOutlet | null;
};

export const EMPTY_MOUNT: MountSnapshot = {
  strategy: 'replace',
  activeHandle: null,
  stageOutgoingHandle: null,
  nestedOutlet: null,
};

export function toMountSlice(snapshot: MountSnapshot): MountSlice {
  return {
    activeHandle: snapshot.activeHandle,
    nestedOutlet: snapshot.nestedOutlet,
    appliedStrategy: snapshot.strategy,
  };
}

export function mergeMount(snapshot: MountSnapshot, slice: MountSlice): MountSnapshot {
  const strategy = slice.appliedStrategy;

  return {
    strategy,
    activeHandle: slice.activeHandle,
    stageOutgoingHandle: strategy === 'stage' ? snapshot.activeHandle : null,
    nestedOutlet: slice.nestedOutlet,
  };
}

export function hasActiveMount(slice: MountSlice, isLayoutRoute: boolean): boolean {
  return !!slice.activeHandle && (!isLayoutRoute || !!slice.nestedOutlet);
}

export function warnMissingLayoutOutlet(
  route: AuraRouteInterface,
  viewKind: ViewKind,
  nestedOutlet: AuraOutlet | null,
): void {
  if (viewKind !== 'layout' || nestedOutlet) return;

  console.warn(
    `AuraRoute layout "${route.layout}" (path: ${route.path}) has no <aura-outlet>`,
  );
}

function resolveStageStrategy(
  ctx: MountContext,
  targetOutlet: AuraOutlet,
): StageStrategy {
  if (ctx.strategy) return ctx.strategy;
  if (!ctx.useStagedMount) return 'replace';
  // Empty outlet: applyStage falls back to replace; skip staging when nothing is visible yet.
  return targetOutlet.children.length > 0 ? 'stage' : 'replace';
}

export function mountContent(
  ctx: MountContext,
  payload: Node | string,
): MountSlice | null {
  if (ctx.signal?.aborted) return null;

  const outlet = resolveOutlet(ctx);
  return applyMount(ctx, outlet, payload, resolveStageStrategy(ctx, outlet));
}

export function reattachContent(ctx: MountContext, cachedRoot: ViewRoot): MountSlice | null {
  if (ctx.signal?.aborted) return null;

  const outlet = resolveOutlet(ctx);
  return applyMount(ctx, outlet, cachedRoot, 'replace');
}

export function unmountHandle(
  handle: ViewHandle | null | undefined,
  preserveView: boolean,
): ViewRoot | null {
  if (!handle) return null;
  if (preserveView) return handle.detach();
  handle.destroy();
  return null;
}

/** @remarks Mutates the outlet DOM via {@link AuraOutlet.commitStage}. */
export function commitStaged(snapshot: MountSnapshot): MountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  snapshot.activeHandle.mountOutlet.commitStage(snapshot.activeHandle.viewRoot);
  snapshot.stageOutgoingHandle?.destroy();

  return {
    ...snapshot,
    strategy: 'replace',
    stageOutgoingHandle: null,
  };
}

/**
 * Abort staged incoming view: cancel outlet DOM layer and destroy the incoming handle.
 * Outgoing handle in `stageOutgoingHandle` is preserved for rollback/teardown callers.
 */
function cancelStagedIncoming(snapshot: MountSnapshot): MountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  const incoming = snapshot.activeHandle;
  incoming.mountOutlet.cancelStage();
  incoming.destroy();

  return { ...snapshot, strategy: 'replace', activeHandle: null };
}

/** Stage-only DOM rollback for `revertInFlightView`. Replace routes: no-op — see docs/todo/REPLACE_SUPERSEDE_ROLLBACK.md. */
export function rollbackStaged(snapshot: MountSnapshot): MountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  const afterCancel = cancelStagedIncoming(snapshot);
  const outgoing = afterCancel.stageOutgoingHandle;

  return {
    strategy: 'replace',
    activeHandle: outgoing,
    stageOutgoingHandle: null,
    nestedOutlet: outgoing?.findChildOutlet() ?? null,
  };
}

export function unmountOnLeave(
  snapshot: MountSnapshot,
  preserveView: boolean,
): { snapshot: MountSnapshot; detachedRoot: ViewRoot | null } {
  if (snapshot.strategy === 'stage') {
    const afterCancel = cancelStagedIncoming(snapshot);
    return {
      detachedRoot: unmountHandle(afterCancel.stageOutgoingHandle, preserveView),
      snapshot: { ...afterCancel, activeHandle: null, stageOutgoingHandle: null },
    };
  }

  return {
    detachedRoot: unmountHandle(snapshot.activeHandle, preserveView),
    snapshot: { ...snapshot, activeHandle: null },
  };
}

/**
 * Param-change remount after render/commit: teardown only a lingering outgoing handle.
 * Active (enter) view must stay mounted — render already replaced or commitStaged promoted it.
 */
export function unmountParamChangeOutgoing(
  snapshot: MountSnapshot,
  preserveView: boolean,
): { snapshot: MountSnapshot; detachedRoot: ViewRoot | null } {
  const outgoing = snapshot.stageOutgoingHandle;
  if (!outgoing) {
    return { snapshot, detachedRoot: null };
  }

  return {
    detachedRoot: unmountHandle(outgoing, preserveView),
    snapshot: { ...snapshot, stageOutgoingHandle: null },
  };
}

export function finalizeLeave(
  snapshot: MountSnapshot,
  preserveView: boolean,
  detachedRoot: ViewRoot | null,
): MountSnapshot {
  return preserveView && detachedRoot ? snapshot : { ...snapshot, nestedOutlet: null };
}

function applyMount(
  ctx: MountContext,
  outlet: AuraOutlet,
  payload: Node | string | ViewRoot,
  strategy: StageStrategy,
): MountSlice | null {
  const handle = outlet.apply(payload, {
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

function resolveOutlet(ctx: MountContext): AuraOutlet {
  const outlet = ctx.mountOutlet ?? ctx.appOutlet;
  if (!outlet) {
    throw new DOMException('<aura-router> must contain <aura-outlet>', 'NotFoundError');
  }
  if (typeof outlet.apply !== 'function') {
    throw new DOMException(
      '<aura-outlet> is not upgraded — register customElements.define(AuraOutlet.is, AuraOutlet)',
      'InvalidStateError',
    );
  }
  return outlet;
}

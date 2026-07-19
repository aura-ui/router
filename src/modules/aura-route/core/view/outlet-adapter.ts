import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../../aura-outlet/core/aura-outlet';
import type { AuraRouteInterface } from '../types';

import { destroyViewRoot } from './dom-cache';
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
  /** Replace routes: outgoing view detached off-DOM until commit gate or rollback. */
  pendingOutgoingRoot: ViewRoot | null;
  nestedOutlet: AuraOutlet | null;
};

export const EMPTY_MOUNT: MountSnapshot = {
  strategy: 'replace',
  activeHandle: null,
  stageOutgoingHandle: null,
  pendingOutgoingRoot: null,
  nestedOutlet: null,
};

export function toMountSlice(snapshot: MountSnapshot): MountSlice {
  return {
    activeHandle: snapshot.activeHandle,
    nestedOutlet: snapshot.nestedOutlet,
    appliedStrategy: snapshot.strategy,
  };
}

export function mergeMount(
  snapshot: MountSnapshot,
  slice: MountSlice,
  detachedOutgoing: ViewRoot | null = null,
): MountSnapshot {
  const strategy = slice.appliedStrategy;

  if (strategy === 'stage') {
    if (snapshot.pendingOutgoingRoot) destroyViewRoot(snapshot.pendingOutgoingRoot);

    return {
      strategy,
      activeHandle: slice.activeHandle,
      stageOutgoingHandle: snapshot.activeHandle,
      pendingOutgoingRoot: null,
      nestedOutlet: slice.nestedOutlet,
    };
  }

  return {
    strategy: 'replace',
    activeHandle: slice.activeHandle,
    stageOutgoingHandle: null,
    pendingOutgoingRoot: detachedOutgoing,
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

/**
 * Mount content and update {@link MountSnapshot} with replace-rollback bookkeeping.
 *
 * Before a replace mount, the current view is detached off-DOM (not destroyed) so
 * {@link rollbackReplace} can restore it if navigation is cancelled before commit gate.
 */
export function applyMountToSnapshot(
  snapshot: MountSnapshot,
  ctx: MountContext,
  payload: Node | string | ViewRoot,
): MountSnapshot | null {
  if (ctx.signal?.aborted) return null;

  const outlet = resolveOutlet(ctx);
  const strategy = resolveStageStrategy(ctx, outlet);
  const detachedOutgoing = detachOutgoingBeforeReplace(snapshot, outlet, strategy);

  const slice = applyMount(ctx, outlet, payload, strategy);
  if (!slice?.activeHandle) {
    if (detachedOutgoing) replaceRootInOutlet(outlet, detachedOutgoing);
    return null;
  }

  return mergeMount(snapshot, slice, detachedOutgoing);
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
  keepDom: boolean,
): ViewRoot | null {
  if (!handle) return null;
  if (keepDom) return handle.detach();
  handle.destroy();
  return null;
}

/** Promote staged view and discard replace rollback snapshot after commit gate. */
export function promoteStagedView(snapshot: MountSnapshot): MountSnapshot {
  return discardPendingOutgoing(commitStaged(snapshot));
}

/** Destroy detached outgoing snapshot after successful commit gate. */
export function discardPendingOutgoing(snapshot: MountSnapshot): MountSnapshot {
  if (!snapshot.pendingOutgoingRoot) return snapshot;

  destroyViewRoot(snapshot.pendingOutgoingRoot);

  return { ...snapshot, pendingOutgoingRoot: null };
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

/** Roll back uncommitted mount: stage restore or replace reattach from detached snapshot. */
export function rollbackUncommittedMount(snapshot: MountSnapshot): MountSnapshot {
  return snapshot.strategy === 'stage'
    ? rollbackStaged(snapshot)
    : rollbackReplace(snapshot);
}

/** Stage-only DOM rollback — restores outgoing view still present in the outlet. */
export function rollbackStaged(snapshot: MountSnapshot): MountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  const afterCancel = cancelStagedIncoming(snapshot);
  const outgoing = afterCancel.stageOutgoingHandle;

  return {
    strategy: 'replace',
    activeHandle: outgoing,
    stageOutgoingHandle: null,
    pendingOutgoingRoot: null,
    nestedOutlet: outgoing?.findChildOutlet() ?? null,
  };
}

/** Replace-only DOM rollback — reattaches {@link MountSnapshot.pendingOutgoingRoot}. */
export function rollbackReplace(snapshot: MountSnapshot): MountSnapshot {
  const outgoing = snapshot.pendingOutgoingRoot;
  if (!outgoing) return snapshot;

  const mountOutlet = snapshot.activeHandle?.mountOutlet;
  const incoming = snapshot.activeHandle;
  incoming?.destroy();

  if (!mountOutlet) {
    destroyViewRoot(outgoing);
    return { ...snapshot, activeHandle: null, pendingOutgoingRoot: null };
  }

  const handle = replaceRootInOutlet(mountOutlet, outgoing);
  if (!handle) {
    destroyViewRoot(outgoing);
    return { ...snapshot, activeHandle: null, pendingOutgoingRoot: null, nestedOutlet: null };
  }

  return {
    strategy: 'replace',
    activeHandle: handle,
    stageOutgoingHandle: null,
    pendingOutgoingRoot: null,
    nestedOutlet: handle.findChildOutlet(),
  };
}

export function unmountOnLeave(
  snapshot: MountSnapshot,
  keepDom: boolean,
): { snapshot: MountSnapshot; detachedRoot: ViewRoot | null } {
  const cleared = discardPendingOutgoing(snapshot);

  if (cleared.strategy === 'stage') {
    const afterCancel = cancelStagedIncoming(cleared);
    return {
      detachedRoot: unmountHandle(afterCancel.stageOutgoingHandle, keepDom),
      snapshot: { ...afterCancel, activeHandle: null, stageOutgoingHandle: null },
    };
  }

  return {
    detachedRoot: unmountHandle(cleared.activeHandle, keepDom),
    snapshot: { ...cleared, activeHandle: null },
  };
}

/**
 * Param-change remount after render/commit: teardown only a lingering outgoing handle.
 * Active (enter) view must stay mounted — render already replaced or commitStaged promoted it.
 */
export function unmountParamChangeOutgoing(
  snapshot: MountSnapshot,
  keepDom: boolean,
): { snapshot: MountSnapshot; detachedRoot: ViewRoot | null } {
  const cleared = discardPendingOutgoing(snapshot);
  const outgoing = cleared.stageOutgoingHandle;

  if (!outgoing) {
    return { snapshot: cleared, detachedRoot: null };
  }

  return {
    detachedRoot: unmountHandle(outgoing, keepDom),
    snapshot: { ...cleared, stageOutgoingHandle: null },
  };
}

export function finalizeLeave(
  snapshot: MountSnapshot,
  keepDom: boolean,
  detachedRoot: ViewRoot | null,
): MountSnapshot {
  return keepDom && detachedRoot ? snapshot : { ...snapshot, nestedOutlet: null };
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

function detachOutgoingBeforeReplace(
  snapshot: MountSnapshot,
  targetOutlet: AuraOutlet,
  strategy: StageStrategy,
): ViewRoot | null {
  if (strategy !== 'replace') return null;

  const handle = snapshot.activeHandle;
  if (!handle || handle.mountOutlet !== targetOutlet) return null;

  if (snapshot.pendingOutgoingRoot) destroyViewRoot(snapshot.pendingOutgoingRoot);

  return handle.detach();
}

function replaceRootInOutlet(outlet: AuraOutlet, root: ViewRoot): ViewHandle | null {
  return outlet.apply(root, { strategy: 'replace' });
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

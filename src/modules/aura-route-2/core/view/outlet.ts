import type {
  AuraOutlet,
  OutletStrategy,
  ViewHandle,
  ViewRoot,
} from '../../../aura-outlet/core/aura-outlet';

type StageStrategy = Extract<OutletStrategy, 'replace' | 'stage'>;

export type MountContext = {
  appOutlet: AuraOutlet;
  mountOutlet: AuraOutlet | null;
  pattern?: string;
  signal?: AbortSignal;
  strategy?: StageStrategy;
  useStagedMount?: boolean;
};

export type MountSlice = {
  activeHandle: ViewHandle | null;
  nestedOutlet: AuraOutlet | null;
  appliedStrategy?: StageStrategy;
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
  };
}

export function mergeMount(snapshot: MountSnapshot, slice: MountSlice): MountSnapshot {
  return {
    strategy: slice.appliedStrategy ?? 'replace',
    activeHandle: slice.activeHandle,
    stageOutgoingHandle: slice.appliedStrategy === 'stage' ? snapshot.activeHandle : null,
    nestedOutlet: slice.nestedOutlet,
  };
}

export function hasActiveMount(slice: MountSlice, isLayoutRoute: boolean): boolean {
  return !!slice.activeHandle && (!isLayoutRoute || !!slice.nestedOutlet);
}

export function resolveStageStrategy(
  ctx: MountContext,
  targetOutlet: AuraOutlet,
): StageStrategy {
  if (ctx.strategy) return ctx.strategy;
  if (!ctx.useStagedMount) return 'replace';
  return targetOutlet.children.length > 0 ? 'stage' : 'replace';
}

export function mountContent(
  ctx: MountContext,
  payload: Node | string,
): MountSlice | null {
  if (ctx.signal?.aborted) return null;

  const outlet = resolveOutlet(ctx);
  const strategy = resolveStageStrategy(ctx, outlet);
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

export function reattachContent(ctx: MountContext, cachedRoot: ViewRoot): MountSlice | null {
  if (ctx.signal?.aborted) return null;

  const outlet = resolveOutlet(ctx);
  const handle = outlet.apply(cachedRoot, {
    strategy: 'replace',
    key: ctx.pattern,
    signal: ctx.signal,
  });

  if (!handle) return null;

  return {
    activeHandle: handle,
    nestedOutlet: handle.findChildOutlet(),
    appliedStrategy: 'replace',
  };
}

export function unmountHandle(
  handle: ViewHandle | null | undefined,
  keepAlive: boolean,
): ViewRoot | null {
  if (!handle) return null;
  if (keepAlive) return handle.detach();
  handle.destroy();
  return null;
}

export function commitStaged(snapshot: MountSnapshot): MountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  snapshot.activeHandle.mountOutlet.commitStage(snapshot.activeHandle.viewRoot);

  return {
    ...snapshot,
    strategy: 'replace',
    stageOutgoingHandle: null,
  };
}

export function cancelStagedIncoming(snapshot: MountSnapshot): MountSnapshot {
  if (snapshot.strategy !== 'stage' || !snapshot.activeHandle) return snapshot;

  snapshot.activeHandle.mountOutlet.cancelStage();

  return {
    ...snapshot,
    strategy: 'replace',
  };
}

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
  keepAlive: boolean,
): { snapshot: MountSnapshot; detachedRoot: ViewRoot | null } {
  if (snapshot.strategy === 'stage') {
    const afterCancel = cancelStagedIncoming(snapshot);
    return {
      detachedRoot: unmountHandle(afterCancel.stageOutgoingHandle, keepAlive),
      snapshot: {
        ...afterCancel,
        activeHandle: null,
        stageOutgoingHandle: null,
      },
    };
  }

  return {
    detachedRoot: unmountHandle(snapshot.activeHandle, keepAlive),
    snapshot: {
      ...snapshot,
      activeHandle: null,
    },
  };
}

export function finalizeLeave(
  snapshot: MountSnapshot,
  keepAlive: boolean,
  detachedRoot: ViewRoot | null,
): MountSnapshot {
  return keepAlive && detachedRoot ? snapshot : { ...snapshot, nestedOutlet: null };
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

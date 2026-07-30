import type { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import {
  EMPTY_MOUNT,
  mergeMount,
  mountContent,
  type MountContext,
  type MountSnapshot,
} from '../../core/view/outlet-adapter';

/** Loose {@link MountContext} stub (same cast pattern as outlet-adapter tests). */
export function createMountContext(
  overrides: Partial<MountContext> & Pick<MountContext, 'appOutlet'>,
): MountContext {
  return overrides as MountContext;
}

/** Stage two sequential mounts (`old` → `new`) for commit / revert tests. */
export function stageTwoViews(
  root: AuraOutlet,
  contents: { first?: string; second?: string } = {},
): MountSnapshot {
  const first = mountContent(
    createMountContext({ appOutlet: root }),
    contents.first ?? '<span>old</span>',
  )!;
  const snapshot = mergeMount(EMPTY_MOUNT, first);
  const second = mountContent(
    createMountContext({ appOutlet: root, useStagedMount: true }),
    contents.second ?? '<span>new</span>',
  )!;

  return mergeMount(snapshot, second);
}

/** Enter-branch mount mode from `mount-strategy` (`branch` default, `full` = URL+DOM together). */
export type MountStrategy = 'branch' | 'full';

const DEFAULT_ROUTER_MOUNT_STRATEGY: MountStrategy = 'branch';

/** Parses `mount-strategy`. Absent / unknown → `branch`. */
export function parseMountStrategyAttr(value: string | null): MountStrategy {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (trimmed === 'full') return trimmed;
  return DEFAULT_ROUTER_MOUNT_STRATEGY;
}

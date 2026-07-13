/** `mount-strategy` attr: branch · full (P1). `per-route` removed — all mounts use branch prepare/commit. */
export const MOUNT_STRATEGIES = ['branch', 'full'] as const;

export type MountStrategy = (typeof MOUNT_STRATEGIES)[number];

/** Recommended explicit router default when using the attr (heuristic applies when absent). */
export const DEFAULT_ROUTER_MOUNT_STRATEGY: MountStrategy = 'branch';

const MODES = new Set<string>(MOUNT_STRATEGIES);

import { isOffKeyword } from './off-keyword';

export function parseMountStrategyAttr(value: string | null): MountStrategy | null {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || isOffKeyword(trimmed)) return null;
  if (MODES.has(trimmed)) return trimmed as MountStrategy;
  return null;
}

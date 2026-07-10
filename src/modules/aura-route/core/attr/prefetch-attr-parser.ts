import { isOffKeyword } from './off-keyword';

/** `prefetch` / `data-prefetch` attr modes (excludes pipeline-only `none`). */
export const LINK_PREFETCH_MODES = [
  'intent',
  'viewport',
  'tap',
  'render',
  'manual',
] as const;

export type PrefetchType = (typeof LINK_PREFETCH_MODES)[number];

export const DEFAULT_ROUTER_PREFETCH_MODE: PrefetchType = 'intent';

const MODES = new Set<string>(LINK_PREFETCH_MODES);

export function parsePrefetchAttr(value: string | null): PrefetchType | false | null {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'true') return DEFAULT_ROUTER_PREFETCH_MODE;
  if (isOffKeyword(trimmed)) return false;
  if (MODES.has(trimmed)) return trimmed as PrefetchType;
  return null;
}

/** Scroll behavior after a successful navigation commit. */
export type ScrollAttr = 'auto' | 'top' | 'none';

import { isOffKeyword } from './off-keyword';

const DEFAULT_SCROLL: ScrollAttr = 'auto';

/**
 * Parses `scroll="auto" | "top"`.
 * Absent / empty → `auto` (push to top, pop restores).
 * `none` / `off` / `false` → `none` (opt out).
 */
export function parseScrollAttr(raw: string | null): ScrollAttr | null {
  if (raw === null) return DEFAULT_SCROLL;

  const normalized = raw.trim().toLowerCase();
  if (isOffKeyword(normalized)) return 'none';
  if (!normalized) return DEFAULT_SCROLL;
  if (normalized === 'auto' || normalized === 'top') {
    return normalized;
  }

  return null;
}

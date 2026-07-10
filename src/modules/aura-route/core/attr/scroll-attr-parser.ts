/** Scroll behavior after a successful navigation commit. */
export type ScrollAttr = 'restore' | 'top' | 'manual';

import { isOffKeyword } from './off-keyword';

/** Parses `scroll="restore" | "top"`. `none` / `off` / `false` → `manual`. */
export function parseScrollAttr(raw: string | null): ScrollAttr | null {
  if (raw === null) return null;

  const normalized = raw.trim().toLowerCase();
  if (isOffKeyword(normalized)) return 'manual';
  if (!normalized) return null;
  if (normalized === 'restore' || normalized === 'top') {
    return normalized;
  }

  return null;
}

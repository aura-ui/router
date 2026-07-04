/** Scroll behavior after a successful navigation commit. */
export type ScrollAttr = 'restore' | 'top' | 'manual';

/** Parses `scroll="restore" | "top"`. Empty string → `manual` (explicit opt-out). */
export function parseScrollAttr(raw: string | null): ScrollAttr | null {
  if (raw === null) return null;

  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return 'manual';
  if (normalized === 'restore' || normalized === 'top') {
    return normalized;
  }

  return null;
}

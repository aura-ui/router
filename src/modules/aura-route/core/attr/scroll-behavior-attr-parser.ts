/**
 * Native scroll animation for router-driven scroll (`scrollTo` / `scrollIntoView`).
 * Matches CSSOM: `smooth` | `instant` | `auto`.
 */
export type ScrollBehaviorAttr = 'smooth' | 'instant' | 'auto';

const DEFAULT: ScrollBehaviorAttr = 'auto';

/**
 * Parses `scroll-behavior="smooth" | "instant" | "auto"`.
 * Absent / empty → `auto` (UA / CSS `scroll-behavior`).
 */
export function parseScrollBehaviorAttr(raw: string | null): ScrollBehaviorAttr | null {
  if (raw === null) return DEFAULT;

  const normalized = raw.trim().toLowerCase();
  if (!normalized) return DEFAULT;
  if (normalized === 'smooth' || normalized === 'instant' || normalized === 'auto') {
    return normalized;
  }

  return null;
}

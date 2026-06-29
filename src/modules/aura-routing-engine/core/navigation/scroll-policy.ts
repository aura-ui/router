/** Scroll behavior after a successful navigation commit. */
export type ScrollPolicy = 'restore' | 'top' | 'manual';

/** When no `scroll` attr is set on router or route (after inherit). */
export const DEFAULT_SCROLL_POLICY: ScrollPolicy = 'manual';

/** Minimal surface for inherited `scroll` attr on router / route elements. */
export type ScrollPolicySource = { scrollPolicy?: ScrollPolicy | null | undefined };

/** Parses `scroll="restore" | "top" | "manual"`. Empty string → `manual` (explicit opt-out). */
export function parseScrollPolicy(raw: string | null): ScrollPolicy | null {
  if (raw === null) return null;

  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return 'manual';
  if (normalized === 'restore' || normalized === 'top' || normalized === 'manual') {
    return normalized;
  }

  return null;
}

export function resolveScrollPolicy(parsed: ScrollPolicy | null | undefined): ScrollPolicy {
  return parsed ?? DEFAULT_SCROLL_POLICY;
}

/** Effective policy from a router/route element (after inherit). */
export function resolveRouteScrollPolicy(source: ScrollPolicySource): ScrollPolicy {
  return resolveScrollPolicy(source.scrollPolicy ?? null);
}

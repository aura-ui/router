/** What to keep when leaving a route (mounted view DOM / loader data). */
export type PreserveFlags = {
  view: boolean;
  data: boolean;
};

export const NO_PRESERVE: PreserveFlags = { view: false, data: false };

/**
 * Parses `<aura-route preserve="…">` attribute value.
 * - absent → no preservation
 * - `preserve` / `preserve=""` / `preserve="view"` → view (DOM) only
 * - `preserve="data"` → loader payload cache
 * - `preserve="all"` → view + data
 */
export function parsePreserveAttr(raw: string | null): PreserveFlags {
  if (raw === null) return NO_PRESERVE;

  const value = raw.trim().toLowerCase();
  if (!value || value === 'view') return { view: true, data: false };
  if (value === 'data') return { view: false, data: true };
  if (value === 'all') return { view: true, data: true };

  return NO_PRESERVE;
}

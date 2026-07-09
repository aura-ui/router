/** What to keep when leaving a route (view DOM / load-hook payload). */
export type PreserveFlags = {
  /** Keep-alive mounted view (ViewCache): url, template, html, import DOM. */
  view: boolean;
  /** Cache `load` hook payloads (DataGraph), not view loaders. */
  data: boolean;
};

export const NO_PRESERVE: PreserveFlags = { view: false, data: false };

/**
 * Parses `<aura-route preserve="…">` attribute value.
 * - absent → no preservation
 * - `preserve` / `preserve=""` / `preserve="view"` → view only (DOM + payload cache)
 * - `preserve="data"` → load hooks only (DataGraph)
 * - `preserve="all"` → view + load hooks
 */
export function parsePreserveAttr(raw: string | null): PreserveFlags {
  if (raw === null) return NO_PRESERVE;

  const value = raw.trim().toLowerCase();
  if (!value || value === 'view') return { view: true, data: false };
  if (value === 'data') return { view: false, data: true };
  if (value === 'all') return { view: true, data: true };

  return NO_PRESERVE;
}

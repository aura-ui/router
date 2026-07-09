/** What to keep when leaving a route. */
export type CacheFlags = {
  /** Detached DOM in ViewCache (keep-alive). */
  dom: boolean;
  /** View-loader payload in ViewPayloadCache (`url`, `html`, …). */
  view: boolean;
  /** `load` hook payload in DataGraph. */
  data: boolean;
};

export const NO_CACHE: CacheFlags = { dom: false, view: false, data: false };

/**
 * Parses `<aura-route cache="…">`.
 *
 * - `dom` — DOM on leave
 * - `view` — loader response cache
 * - `data` — load-hook cache
 * - `screen` — dom + view (typical tab)
 * - `all` — dom + view + data
 * - `off` — opt out (overrides inherited cache)
 * - `cache` / `cache=""` — same as `screen`
 */
export function parseCacheAttr(raw: string | null): CacheFlags {
  if (raw === null) return NO_CACHE;

  const value = raw.trim().toLowerCase();
  if (!value) return { dom: true, view: true, data: false };

  switch (value) {
    case 'dom':
      return { dom: true, view: false, data: false };
    case 'view':
      return { dom: false, view: true, data: false };
    case 'data':
      return { dom: false, view: false, data: true };
    case 'screen':
      return { dom: true, view: true, data: false };
    case 'all':
      return { dom: true, view: true, data: true };
    case 'off':
      return NO_CACHE;
    default:
      return NO_CACHE;
  }
}

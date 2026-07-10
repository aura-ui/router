/** What to keep when leaving a route. */
import { isOffKeyword } from './off-keyword';

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
 * - `none` / `off` / `false` — opt out (overrides inherited cache)
 */
export function parseCacheAttr(raw: string | null): CacheFlags {
  if (raw === null) return NO_CACHE;

  const value = raw.trim().toLowerCase();
  if (!value || isOffKeyword(value)) return NO_CACHE;

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
    default:
      return NO_CACHE;
  }
}

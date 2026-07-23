/** What to keep when leaving a route. */
import { isOffKeyword } from './off-keyword';

export type CacheFlags = {
  /** Detached DOM in RouteDomCache (keep-alive). */
  dom: boolean;
  /** View-loader payload in ViewGraph cache (`url`, `html`, …). */
  view: boolean;
  /** `load` hook payload in DataGraph. */
  data: boolean;
};

export const NO_CACHE: CacheFlags = { dom: false, view: false, data: false };
/** Bare `cache` / `cache=""` — view + data, no DOM keep-alive. */
export const DEFAULT_CACHE: CacheFlags = { dom: false, view: true, data: true };
export const DOM_CACHE: CacheFlags = { dom: true, view: true, data: false };
export const ALL_CACHE: CacheFlags = { dom: true, view: true, data: true };

/**
 * Parses `<aura-route cache="…">`.
 *
 * - bare `cache` / `cache=""` — view + data
 * - `dom` — DOM keep-alive + view-loader fallback
 * - `view` — loader response cache
 * - `data` — load-hook cache
 * - `all` — dom + view + data
 * - `none` / `off` / `false` — opt out (overrides inherited cache)
 */
export function parseCacheAttr(raw: string | null): CacheFlags {
  if (raw === null) return NO_CACHE;

  const value = raw.trim().toLowerCase();
  if (!value) return DEFAULT_CACHE;
  if (isOffKeyword(value)) return NO_CACHE;

  switch (value) {
    case 'dom':
      return DOM_CACHE;
    case 'view':
      return { dom: false, view: true, data: false };
    case 'data':
      return { dom: false, view: false, data: true };
    case 'all':
      return ALL_CACHE;
    default:
      console.warn(
        `Invalid cache attribute value "${raw.trim()}"; expected dom, view, data, all, or none/off/false`,
      );
      return NO_CACHE;
  }
}

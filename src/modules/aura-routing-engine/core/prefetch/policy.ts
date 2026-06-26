import { parsePath } from '../../../aura-utils/misc/url';
import type { PrefetchConfig, PrefetchMode, PrefetchSkipReason } from './types';

export const DEFAULT_INTENT_DELAY_MS = 50;
export const DEFAULT_STALE_TIME_MS = 30_000;
export const DEFAULT_MAX_AGE_MS = 30_000;

export function normalizePrefetchHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('http') || trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('#')) return null;

  const { pathname, search, hash } = parsePath(trimmed);
  if (!pathname) return null;
  return pathname + search + hash;
}

/**
 * Skip prefetch when both URLs are the same route and only the hash changes.
 * Stricter than engine `isHashOnly` (navigation): requires an existing hash on the
 * current location so `/page` → `/page#section` can still prefetch content.
 */
export function isHashOnlyNavigation(href: string, currentHref: string): boolean {
  const next = parsePath(href);
  const current = parsePath(currentHref);
  const sameRoute = next.pathname === current.pathname && next.search === current.search;
  return Boolean(sameRoute && current.hash && next.hash && next.hash !== current.hash);
}

export function isSaveDataPreferred(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

export function delayForMode(mode: PrefetchMode, config: PrefetchConfig): number {
  switch (mode) {
    case 'intent':
    case 'render':
      return config.intentDelayMs ?? DEFAULT_INTENT_DELAY_MS;
    case 'viewport':
      return config.viewportDelayMs ?? 0;
    case 'tap':
      return config.tapDelayMs ?? 0;
    case 'manual':
    case 'none':
      return 0;
  }
}

export function shouldSkipPrefetch(input: {
  href: string;
  mode: PrefetchMode;
  config: PrefetchConfig;
  lastPrefetchAt?: number;
  force?: boolean;
}): PrefetchSkipReason | null {
  const { href, mode, config, lastPrefetchAt, force } = input;

  if (mode === 'none') return 'disabled';
  if (force) return null;
  if (isSaveDataPreferred()) return 'save-data';

  const normalized = normalizePrefetchHref(href);
  if (!normalized) return 'invalid-href';

  const currentHref = config.currentHref?.() ?? '';
  if (currentHref && isHashOnlyNavigation(normalized, currentHref)) return 'hash-only';

  const staleTime = config.staleTimeMs ?? DEFAULT_STALE_TIME_MS;
  if (lastPrefetchAt !== undefined && Date.now() - lastPrefetchAt < staleTime) {
    return 'same-route-fresh';
  }

  return null;
}

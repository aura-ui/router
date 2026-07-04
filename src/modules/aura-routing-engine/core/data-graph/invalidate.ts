import type { InvalidatePolicy } from '../../../aura-cache-store/core/aura-cache-store';

/** Options for {@link AuraRoutingEngine.invalidateData} / {@link AuraRouter.invalidate}. */
export type RouterDataInvalidateOptions = {
  /** Exact DataGraph cache key ({@link buildRouteDataKey}). */
  key?: string;
  /** Match keys for this route path prefix (e.g. `/users`). */
  path?: string;
  /** Custom key predicate. */
  match?: (key: string) => boolean;
  /**
   * `'stale'` (default) — keep data readable, mark outdated (SWR on next load).
   * `'remove'` — drop entries immediately.
   */
  policy?: InvalidatePolicy;
  /** Also clear the content loader cache (`html-src`, etc.). */
  content?: boolean;
};

/** Builds a cache-key predicate from {@link RouterDataInvalidateOptions}. `null` = all keys. */
export function resolveDataInvalidatePredicate(
  options?: Pick<RouterDataInvalidateOptions, 'key' | 'path' | 'match'>,
): ((key: string) => boolean) | null {
  if (!options?.key && !options?.path && !options?.match) return null;

  if (options.key) {
    const key = options.key;
    return (entryKey) => entryKey === key;
  }

  if (options.path) {
    const path = options.path;
    return (entryKey) => entryKey === path || entryKey.startsWith(`${path}|`);
  }

  return options.match!;
}

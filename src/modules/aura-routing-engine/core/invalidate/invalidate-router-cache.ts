import type { InvalidatePolicy } from '../../../aura-cache-store/core';
import { resolveRouterInvalidatePredicate } from './predicate';
import type { RouterInvalidateOptions } from './types';

/** Minimal cache surface for scoped router invalidation. */
export type RouterCacheInvalidator = {
  invalidate(key: string, policy?: InvalidatePolicy): boolean;
  invalidateMatch(predicate: (key: string) => boolean, policy?: InvalidatePolicy): number;
  invalidateAll(policy?: InvalidatePolicy): number;
};

/**
 * Invalidates router cache entries by key, path prefix, custom match, or all entries.
 * Returns `-1` when a full invalidate matched no entries.
 */
export function invalidateRouterCache(
  cache: RouterCacheInvalidator,
  options: RouterInvalidateOptions = {},
  defaultPolicy: InvalidatePolicy = 'stale',
): number {
  const policy = options.policy ?? defaultPolicy;

  if (options.key) {
    return cache.invalidate(options.key, policy) ? 1 : 0;
  }

  const predicate = resolveRouterInvalidatePredicate(options);
  if (predicate === null) {
    const count = cache.invalidateAll(policy);
    return count > 0 ? count : -1;
  }

  return cache.invalidateMatch(predicate, policy);
}

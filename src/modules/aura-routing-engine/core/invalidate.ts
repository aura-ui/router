import type { InvalidatePolicy } from '../../aura-cache-store/core';

/** Separator between path and hook segments in cache keys (`/users|fetch`). */
const CACHE_KEY_SEP = '|';

/** Returns whether a cache key belongs to the given route path. */
function matchesPath(entryKey: string, path: string): boolean {
  return entryKey === path || entryKey.startsWith(`${path}${CACHE_KEY_SEP}`);
}

/**
 * Tests whether a cache key should be invalidated.
 * Used with {@link RouterCacheInvalidator.invalidateMatch}.
 */
export type CacheKeyMatcher = (key: string) => boolean;

/**
 * Scope for cache invalidation.
 *
 * Omit all fields to invalidate every entry. When multiple fields are set,
 * {@link buildKeyMatcher} resolves in order: `key` → `path` → `match`.
 */
export type InvalidateScope = {
  /** Exact cache key ({@link buildRouteDataKey} or {@link payloadCacheKey}). */
  key?: string;
  /**
   * Route pathname — matches the bare path and keys prefixed with `path|`
   * (e.g. `/users` matches `/users|fetch-user`).
   */
  path?: string;
  /** Custom key filter when `key` and `path` are not enough. */
  match?: CacheKeyMatcher;
};

/**
 * Options for {@link invalidateRouterCache}, {@link DataGraph.invalidate},
 * {@link AuraRoutingEngine.invalidateData}, and {@link AuraRoutingEngine.invalidateContent}.
 */
export type RouterInvalidateOptions = InvalidateScope & {
  /**
   * How affected entries are updated.
   * `'stale'` (default) — keep values, mark outdated (SWR on next load).
   * `'remove'` — drop entries immediately.
   */
  policy?: InvalidatePolicy;
};

/**
 * Minimal cache surface required by {@link invalidateRouterCache}.
 * Implemented by {@link AuraResolvableCache} in DataGraph and ContentGraph.
 */
export type RouterCacheInvalidator = {
  /** Invalidates a single key. Returns whether the key existed. */
  invalidate(key: string, policy?: InvalidatePolicy): boolean;
  /** Invalidates all keys matched by `matcher`. Returns affected entry count. */
  invalidateMatch(matcher: CacheKeyMatcher, policy?: InvalidatePolicy): number;
  /** Invalidates every entry. Returns affected entry count. */
  invalidateAll(policy?: InvalidatePolicy): number;
};

/**
 * Builds a cache-key matcher from scope.
 *
 * @returns A matcher function, or `null` when scope is empty (= invalidate all keys).
 */
function buildKeyMatcher(scope?: InvalidateScope): CacheKeyMatcher | null {
  const { key, path, match } = scope ?? {};
  if (key) return (entryKey) => entryKey === key;
  if (path) return (entryKey) => matchesPath(entryKey, path);
  if (match) return match;
  return null;
}

/**
 * Invalidates cache entries in {@link DataGraph} or {@link ContentGraph} by scope and policy.
 *
 * Resolution order when multiple scope fields are set: `key` → `path` → `match` → all entries.
 * An exact `key` uses a direct lookup; other scopes scan via {@link RouterCacheInvalidator.invalidateMatch}.
 *
 * @param cache - Backing store ({@link AuraResolvableCache}).
 * @param options - Invalidation scope and optional {@link InvalidatePolicy}.
 * @param defaultPolicy - Policy when `options.policy` is omitted. Default: `'stale'`.
 * @returns Affected entry count. `0` when a scoped invalidate matched nothing.
 *   `-1` when a full invalidate ran against an empty cache.
 */
export function invalidateRouterCache(
  cache: RouterCacheInvalidator,
  options: RouterInvalidateOptions = {},
  defaultPolicy: InvalidatePolicy = 'stale',
): number {
  const { policy = defaultPolicy, key, path, match } = options;

  if (key) {
    return cache.invalidate(key, policy) ? 1 : 0;
  }

  const matcher = buildKeyMatcher({ path, match });
  if (!matcher) {
    const count = cache.invalidateAll(policy);
    return count > 0 ? count : -1;
  }

  return cache.invalidateMatch(matcher, policy);
}

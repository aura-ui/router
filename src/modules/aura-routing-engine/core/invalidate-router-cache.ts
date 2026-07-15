import type { InvalidatePolicy } from '../../aura-cache-store/core';

/** Separator between identity segments in cache keys (`data:/users|id=1`). */
const CACHE_KEY_SEP = '|';

/** Kind prefix length for `data:` / `view:` resource keys. */
const KIND_PREFIX_LEN = 5;

/**
 * Tests whether a cache key should be invalidated.
 * Used with {@link RouterCacheInvalidator.invalidateMatch}.
 */
export type CacheKeyMatcher = (key: string) => boolean;

/**
 * Scope for cache invalidation.
 *
 * Omit all fields to invalidate every entry. When multiple fields are set,
 * resolution order is `key` → `path` → `match`.
 */
export type InvalidateScope = {
  /** Exact cache key (`match.dataKey` / `match.viewKey` / {@link viewKeyWithData}). */
  key?: string;
  /**
   * Route **pattern** (e.g. `/users/:id`), not browser pathname.
   * Matches `data:{pattern}` / `view:{pattern}` and keys with `|…` after the pattern.
   */
  path?: string;
  /** Custom key filter when `key` and `path` are not enough. */
  match?: CacheKeyMatcher;
};

/**
 * Options for {@link invalidateRouterCache}, {@link DataGraph.invalidate},
 * {@link AuraRoutingEngine.invalidateData}, and {@link AuraRoutingEngine.invalidateView}.
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
 * Implemented by {@link AuraResolvableCache} in DataGraph and ViewGraph.
 */
export type RouterCacheInvalidator = {
  /** Invalidates a single key. Returns whether the key existed. */
  invalidate(key: string, policy?: InvalidatePolicy): boolean;
  /** Invalidates all keys matched by `matcher`. Returns affected entry count. */
  invalidateMatch(matcher: CacheKeyMatcher, policy?: InvalidatePolicy): number;
  /** Invalidates every entry. Returns affected entry count. */
  invalidateAll(policy?: InvalidatePolicy): number;
};

/** Keys are always `data:…` or `view:…` — strip the kind prefix, then match pattern. */
function belongsToPath(entryKey: string, path: string): boolean {
  const body = entryKey.slice(KIND_PREFIX_LEN);
  return body === path || body.startsWith(`${path}${CACHE_KEY_SEP}`);
}

function exactKeyMatcher(key: string): CacheKeyMatcher {
  return (entryKey) => entryKey === key;
}

function pathPrefixMatcher(path: string): CacheKeyMatcher {
  return (entryKey) => belongsToPath(entryKey, path);
}

/**
 * Builds a cache-key matcher from scope.
 *
 * @returns A matcher function, or `null` when scope is empty (= invalidate all keys).
 */
function buildKeyMatcher(scope?: InvalidateScope): CacheKeyMatcher | null {
  const { key, path, match } = scope ?? {};
  if (key) return exactKeyMatcher(key);
  if (path) return pathPrefixMatcher(path);
  if (match) return match;
  return null;
}

function invalidateExactKey(
  cache: RouterCacheInvalidator,
  key: string,
  policy: InvalidatePolicy,
): number {
  return cache.invalidate(key, policy) ? 1 : 0;
}

/** Returns `-1` when the cache had no entries to invalidate. */
function invalidateEveryKey(cache: RouterCacheInvalidator, policy: InvalidatePolicy): number {
  const count = cache.invalidateAll(policy);
  return count > 0 ? count : -1;
}

/**
 * Invalidates cache entries in {@link DataGraph} or {@link ViewGraph} by scope and policy.
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
  const policy = options.policy ?? defaultPolicy;

  if (options.key) {
    return invalidateExactKey(cache, options.key, policy);
  }

  const matcher = buildKeyMatcher(options);
  if (!matcher) {
    return invalidateEveryKey(cache, policy);
  }

  return cache.invalidateMatch(matcher, policy);
}

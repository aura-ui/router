import type { InvalidatePolicy } from '../../../aura-cache-store/core';

/** Scoped router cache invalidation: exact key, path prefix, custom match, or all entries. */
export type RouterInvalidateOptions = {
  /** Exact cache key ({@link buildRouteDataKey} or {@link payloadCacheKey}). */
  key?: string;
  /** Route pathname — matches the key and all keys with this path prefix. */
  path?: string;
  match?: (key: string) => boolean;
  policy?: InvalidatePolicy;
};

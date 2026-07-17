import type { CacheStoreOptions } from '../../../aura-cache-store/core';
import {
  AuraResolvableCache,
  type ResolvableCachePolicy,
} from '../../../aura-cache-store/core/aura-resolvable-cache';

/** Default prepare handoff window (prefetch → navigation), milliseconds. */
export const DEFAULT_HANDOFF_TTL_MS = 30_000;

/**
 * Options for {@link HandoffCache}.
 *
 * Uses short TTL (`ttl`) without SWR: entries stay readable until expired, then
 * are removed on access — hover→click join, not long-lived route revisit cache.
 */
export type HandoffCacheOptions = ResolvableCachePolicy & {
  /**
   * How long a settled value stays available for a later {@link AuraResolvableCache.resolve}.
   * Default: {@link DEFAULT_HANDOFF_TTL_MS}.
   */
  readonly ttl?: number;
  /** Max entries (LRU). */
  readonly max?: number;
  /**
   * Background GC sweep. Default `false` — expire lazily on access.
   * Pass a ms interval only when proactive sweep is needed.
   */
  readonly gcSweepInterval?: CacheStoreOptions<unknown>['gcSweepInterval'];
  /** Called when a value is discarded (LRU, TTL, delete, clear, invalidate remove). */
  readonly onRemove?: (key: string, value: unknown) => void;
};

/**
 * Short-lived prepare handoff: in-flight dedupe + TTL settle.
 *
 * Thin specialization of {@link AuraResolvableCache}: default TTL, no SWR.
 * Long-lived route revisit stays behind `cache.data` / `cache.view` (separate stores
 * or constructor {@link ResolvableCachePolicy.onSettled}).
 *
 * Owned by {@link ResourceGraph}; DataGraph / ViewGraph share one instance.
 *
 * Use {@link AuraResolvableCache.join} from `ctx.parent()` / waiters to attach to
 * in-flight or settled prepare without starting a new load.
 */
export class HandoffCache extends AuraResolvableCache<unknown> {
  constructor(options: HandoffCacheOptions = {}) {
    const { ttl, max, gcSweepInterval, onRemove, write, onSettled } = options;
    super({
      max,
      // No staleTime: fresh until gcTime, then missing (no background revalidate).
      gcTime: ttl ?? DEFAULT_HANDOFF_TTL_MS,
      gcSweepInterval: gcSweepInterval ?? false,
      invalidatePolicy: 'remove',
      onRemove,
      write,
      onSettled,
    });
  }
}

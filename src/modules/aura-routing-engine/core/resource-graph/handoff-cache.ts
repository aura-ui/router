import type { CacheStoreOptions } from '../../../aura-cache-store/core';
import {
  AuraResolvableCache,
  type ResolvableCachePolicy,
} from '../../../aura-cache-store/core/aura-resolvable-cache';
import {
  HandoffWorkRegistry,
  type HandoffWaiter,
  type HandoffWaiterKind,
} from './handoff-work-registry';

export type { HandoffWaiter, HandoffWaiterKind } from './handoff-work-registry';

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
 * Short-lived prepare handoff: in-flight dedupe + TTL settle + work waiters.
 *
 * Thin specialization of {@link AuraResolvableCache}: default TTL, no SWR.
 * Long-lived route revisit stays behind `cache.data` / `cache.view`.
 *
 * Work-signal abort policy lives in {@link HandoffWorkRegistry}
 * ({@link hold} / {@link HandoffWaiter.release}).
 *
 * Created by {@link AuraRoutingEngine}; DataGraph / ViewGraph share one instance.
 */
export class HandoffCache extends AuraResolvableCache<unknown> {
  private readonly work = new HandoffWorkRegistry();

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

  /**
   * Register a work waiter for `key` (shared {@link HandoffWaiter.workSignal}).
   * @see HandoffWorkRegistry.hold
   */
  hold(key: string, kind: HandoffWaiterKind): HandoffWaiter {
    return this.work.hold(key, kind);
  }

  /**
   * Active (unreleased) work-waiter count for `key`.
   * @internal @see HandoffWorkRegistry.waiterCount
   */
  waiterCount(key: string): number {
    return this.work.waiterCount(key);
  }

  /** Abort outstanding work signals, then destroy the resolvable cache. */
  override destroy(): void {
    this.work.destroy();
    super.destroy();
  }
}

import type { SwrCacheOptions } from '../../../aura-cache/core';
import {
  AuraResolvableSwrCache,
  type ResolvableSwrCachePolicy,
} from '../../../aura-cache/core/aura-resolvable-swr-cache';
import { ENGINE_DEFAULTS } from '../aura-routing-engine-config';

import {
  HandoffWorkRegistry,
  type HandoffWaiter,
  type HandoffWaiterKind,
} from './handoff-work-registry';

export type { HandoffWaiter, HandoffWaiterKind } from './handoff-work-registry';

/**
 * Options for {@link HandoffCache}.
 *
 * Uses short TTL (`ttl`) without SWR: entries stay readable until expired, then
 * are removed on access — hover→click / in-flight join. Successful navigation
 * consumes enter keys via ResourceGraph.consumeSharedBufferFor; long revisit is
 * `cache.data` / `cache.view` only.
 */
export type HandoffCacheOptions = {
  /**
   * How long a settled value stays available for a later {@link AuraResolvableSwrCache.resolve}.
   * Default: {@link ENGINE_DEFAULTS.sharedBufferOptions}.ttl.
   */
  readonly ttl?: number;
  /** Max entries (LRU). */
  readonly max?: number;
  /**
   * Background GC sweep. Default `false` — expire lazily on access.
   * Pass a ms interval only when proactive sweep is needed.
   */
  readonly gcSweepInterval?: SwrCacheOptions<unknown>['gcSweepInterval'];
  /** Called when a value is discarded (LRU, TTL, delete, clear, invalidate remove). */
  readonly onRemove?: (key: string, value: unknown) => void;
  /** Extra side-effect after a successful load settle (does not control persist). */
  readonly onSettled?: ResolvableSwrCachePolicy['onSettled'];
};

/**
 * Short-lived prepare handoff: in-flight dedupe + TTL settle + work waiters.
 *
 * Thin specialization of {@link AuraResolvableSwrCache}: default TTL, no SWR.
 * Long-lived route revisit stays behind `cache.data` / `cache.view`.
 *
 * {@link DocumentFragment} is never persisted (one-shot DOM; mount empties it) —
 * bare fragments or ViewGraph values `{ payload: DocumentFragment, head }`.
 * In-flight join still works; a later resolve reloads / re-clones.
 *
 * Work-signal policy: {@link HandoffWorkRegistry} (короткая модель interest / workSignal / hold).
 *
 * Owned by {@link ResourceGraph}; DataGraph / ViewGraph share one instance
 * (different keys; view values may wrap payload+head).
 */
export class HandoffCache extends AuraResolvableSwrCache<unknown> {
  private readonly work = new HandoffWorkRegistry();

  constructor(options: HandoffCacheOptions = {}) {
    const {
      ttl = ENGINE_DEFAULTS.sharedBufferOptions.ttl,
      max,
      gcSweepInterval = false,
      onRemove,
      onSettled,
    } = options;
    super({
      max,
      // No staleTime: fresh until gcTime, then missing (no background revalidate).
      gcTime: ttl,
      gcSweepInterval,
      invalidatePolicy: 'remove',
      onRemove,
      // One-shot DOM: mount empties the node; never settle fragments for reuse.
      write: (value) => !holdsDocumentFragment(value),
      onSettled,
    });
  }

  /**
   * Register a work waiter for `key` (shared {@link HandoffWaiter.workSignal}).
   *
   * @param kind - {@link HandoffWaiterKind}. Only `'navigation'` sets sticky abort-on-idle.
   *   `'pin'` = supersede refcount bridge ({@link ResourceGraph.pinSharedBufferFor}),
   *   not a prepare mode and not a TTL lease.
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

  /**
   * Drop settled values and in-flight singleflight slots; abort all work generations.
   * Stale loads that settle after this call do not rewrite the store (epoch gate).
   */
  override clear(): void {
    this.work.destroy();
    super.clear();
  }

  /** Abort outstanding work signals, then destroy the resolvable cache. */
  override destroy(): void {
    this.work.destroy();
    super.destroy();
  }
}

/** Bare {@link DocumentFragment}, or ViewGraph `{ payload: DocumentFragment }`. */
function holdsDocumentFragment(value: unknown): boolean {
  if (typeof DocumentFragment === 'undefined') return false;
  if (value instanceof DocumentFragment) return true;
  if (value === null || typeof value !== 'object' || !('payload' in value)) return false;
  return (value as { payload: unknown }).payload instanceof DocumentFragment;
}

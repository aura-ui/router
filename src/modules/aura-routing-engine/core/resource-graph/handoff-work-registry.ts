/**
 * Interest kind for a {@link HandoffWaiter} on a handoff key.
 *
 * - `'speculative'` — prefetch / hover probe. If only this kind was seen, idle
 *   release keeps the work generation alive so a later hold can rejoin.
 * - `'navigation'` — navigation prepare. Sticky for the generation: when the last
 *   waiter releases after this was seen, work is aborted.
 */
export type HandoffWaiterKind = 'speculative' | 'navigation';

/**
 * One hold on shared prepare work for a resource key ({@link HandoffWorkRegistry.hold}).
 *
 * {@link workSignal} is for the shared load factory (hooks/fetch). Caller interest
 * (transaction / sibling abort) is a separate signal at the call site — releasing
 * this waiter (or cancelling interest) does not by itself abort other waiters;
 * only the registry idle policy may abort {@link workSignal}.
 */
export type HandoffWaiter = {
  /** Resource key this waiter is held on. */
  readonly key: string;
  /** Kind passed to {@link HandoffWorkRegistry.hold}. */
  readonly kind: HandoffWaiterKind;
  /**
   * Shared load-factory {@link AbortSignal} for this key’s current generation.
   * Not the caller interest signal.
   */
  readonly workSignal: AbortSignal;
  /**
   * Drop this waiter. Idempotent.
   * Aborts {@link workSignal} only when this was the last waiter and `'navigation'`
   * was seen on the generation.
   */
  release(): void;
};

/**
 * One work generation for a key: shared {@link AbortController} + waiter refcount.
 * Deleted on policy abort (or {@link HandoffWorkRegistry.destroy}); the next
 * {@link HandoffWorkRegistry.hold} creates a new generation.
 */
type WorkEntry = {
  /** Controller whose signal is exposed as {@link HandoffWaiter.workSignal}. */
  controller: AbortController;
  /** Active (not yet {@link HandoffWaiter.release | released}) waiters on this generation. */
  refs: number;
  /**
   * Sticky: a `'navigation'` waiter held this generation at least once.
   * When `refs` hits 0 and this is set → abort and delete. Speculative-only idle
   * leaves the entry in place (same `workSignal` for a later hold).
   */
  seenNavigation: boolean;
};

/**
 * Per-key shared work {@link AbortSignal} + waiter refcount for prepare handoff.
 *
 * Concurrent {@link hold}s on the same key share one generation until that
 * generation’s work is aborted.
 *
 * When the last waiter {@link HandoffWaiter.release | releases}:
 * - never seen `'navigation'` → keep the generation (speculative rejoin / hover fidget)
 * - seen `'navigation'` → abort {@link HandoffWaiter.workSignal} and drop the entry
 *
 * Owned by {@link HandoffCache}. This type does not store settled values — only
 * work-signal lifetime; value handoff is {@link HandoffCache} itself.
 */
export class HandoffWorkRegistry {
  /**
   * Generations by resource key.
   * Policy-aborted entries are removed; speculative-idle entries may remain with `refs === 0`.
   */
  private readonly entries = new Map<string, WorkEntry>();

  /**
   * Register a waiter on `key` and return a {@link HandoffWaiter} for that generation.
   *
   * @param key - Resource identity (e.g. `data:…` / `view:…`).
   * @param kind - Interest kind. `'navigation'` sets sticky abort-on-idle for this generation.
   * @returns Waiter whose {@link HandoffWaiter.workSignal} is shared with other active holds on `key`.
   */
  hold(key: string, kind: HandoffWaiterKind): HandoffWaiter {
    const entry = this.entryFor(key);
    if (kind === 'navigation') entry.seenNavigation = true;
    entry.refs++;

    let released = false;
    return {
      key,
      kind,
      workSignal: entry.controller.signal,
      release: () => {
        if (released) return;
        released = true;
        this.releaseEntry(key, entry);
      },
    };
  }

  /**
   * Number of active (unreleased) waiters for `key`.
   * `0` if the key is absent or only a speculative-idle generation remains.
   * @internal Tests / diagnostics.
   */
  waiterCount(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  /** Abort every generation’s {@link HandoffWaiter.workSignal} and clear the map. */
  destroy(): void {
    for (const { controller } of this.entries.values()) {
      controller.abort();
    }
    this.entries.clear();
  }

  /**
   * Existing non-aborted generation for `key`, or create a new one.
   * If a map slot exists but its signal is already aborted, it is replaced.
   */
  private entryFor(key: string): WorkEntry {
    const existing = this.entries.get(key);
    if (existing && !existing.controller.signal.aborted) return existing;

    const entry: WorkEntry = {
      controller: new AbortController(),
      refs: 0,
      seenNavigation: false,
    };
    this.entries.set(key, entry);
    return entry;
  }

  /**
   * Apply one {@link HandoffWaiter.release}. No-op if `entry` is not the current map value
   * (stale after abort / replace). Aborts and deletes when idle after navigation interest.
   */
  private releaseEntry(key: string, entry: WorkEntry): void {
    // Stale waiter after abort / new generation.
    if (this.entries.get(key) !== entry) return;

    entry.refs--;
    if (entry.refs > 0 || !entry.seenNavigation) return;

    entry.controller.abort();
    this.entries.delete(key);
  }
}

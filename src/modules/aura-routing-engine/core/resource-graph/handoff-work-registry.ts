/** Interest that holds a lease — drives abort policy when the last lease releases. */
export type HandoffWaiterKind = 'speculative' | 'navigation';

/**
 * Lease on in-flight prepare work for one resource key.
 *
 * - {@link workSignal} — shared load factory signal (not the caller interest signal).
 * - {@link release} — drop this lease; may abort work when idle policy says so.
 */
export type HandoffLease = {
  readonly key: string;
  readonly kind: HandoffWaiterKind;
  readonly workSignal: AbortSignal;
  /** Idempotent. */
  release(): void;
};

/** One AbortController generation per key. */
type WorkEntry = {
  controller: AbortController;
  /** Active {@link HandoffWorkRegistry.acquire} leases. */
  refs: number;
  /**
   * Sticky: navigation leased this key at least once.
   * Idle + flag → abort. Pure speculative idle → keep running for hover rejoin.
   */
  seenNavigation: boolean;
};

/**
 * Per-key shared work {@link AbortSignal} + lease refcount for prepare handoff.
 *
 * When the last lease releases:
 * - never seen navigation → keep work alive (hover fidget / prefetch handoff)
 * - seen navigation → abort work (nav supersede / orphan interest)
 */
export class HandoffWorkRegistry {
  private readonly entries = new Map<string, WorkEntry>();

  /**
   * Take a lease on `key` and return the shared work signal for that generation.
   * Concurrent acquires share one controller until work aborts; next acquire starts a new one.
   */
  acquire(key: string, kind: HandoffWaiterKind): HandoffLease {
    const entry = this.liveEntry(key);
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

  /** @internal Active lease count for `key` (tests / diagnostics). */
  waiterCount(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  /** Abort all live work and drop entries. */
  destroy(): void {
    for (const { controller } of this.entries.values()) {
      controller.abort();
    }
    this.entries.clear();
  }

  /** Live (non-aborted) entry, or a fresh generation. */
  private liveEntry(key: string): WorkEntry {
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

  private releaseEntry(key: string, entry: WorkEntry): void {
    // Stale lease after abort / new generation.
    if (this.entries.get(key) !== entry) return;

    entry.refs--;
    if (entry.refs > 0 || !entry.seenNavigation) return;

    entry.controller.abort();
    this.entries.delete(key);
  }
}

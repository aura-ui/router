/**
 * Interest kind for a {@link HandoffWaiter} on a handoff key.
 *
 * Abort policy depends only on sticky `hadNavigation` (set solely by `'navigation'`).
 * `'prefetch'` and `'pin'` both increment `refs` without that flag — same abort polarity,
 * different roles (see below). There is no `if (kind === 'pin')` branch: pin is “not
 * navigation” for sticky abort, not a separate code path.
 *
 * - `'prefetch'` — hover / intent probe (DataGraph / ViewGraph with `mode: 'prefetch'`).
 *   Idle release keeps the work generation alive so a later hold can rejoin.
 * - `'navigation'` — real navigation prepare hold. Sticky: when the last waiter releases
 *   after this was seen, {@link HandoffWaiter.workSignal} is aborted. Intentional:
 *   prepare came and left.
 * - `'pin'` — short supersede bridge only ({@link ResourceGraph.pinSharedBufferFor}).
 *   Used only when an `activeTransaction` already exists. Order:
 *   hold B’s keys → `cancel(A)` → `B.run()` → {@link SharedBufferHold.unpin} in `finally`.
 *   Means “keep `refs` across cancel(A)”, **not** “navigation prepare ran”.
 *
 * ### Why `'pin'` is not `'navigation'`
 *
 * Releasing a pin (`unpin`) must drop the coordinator’s refcount — that is always correct.
 * Pin must **not** set `hadNavigation`, or early B exit is mistaken for “a navigation
 * prepare visited this key and everyone left” and aborts shared work.
 *
 * Pin is **not** taken on every click — only while superseding an in-flight navigation.
 * Idle page + click `/b` has no pin; prefetch-idle on `/b` is already safe without it.
 *
 * **Bad (pin wrongly as `'navigation'`), supersede:** A still active → prefetch idle on
 * `/b` → click `/b` → pin → guard fails before prepare → `unpin` → `hadNavigation` +
 * `refs === 0` → abort → warmup dead → retry refetches.
 *
 * **Good (`'pin'`), same supersede sequence:** pin leaves, work stays idle → later prepare
 * / click can join in-flight singleflight or a settled handoff value (TTL ~30s is separate).
 *
 * **Also required (correctness):** A→B with a **shared** key (e.g. LCA parent). Pin keeps
 * `refs > 0` across `cancel(A)` so A’s real `'navigation'` `release` does not abort work
 * B is about to take.
 *
 * **Lifetime:** supersede window only (until `unpin`) — not handoff TTL and not “until
 * prefetch finishes”. Pin does **not** block abort forever: after a real `'navigation'`
 * hold has been seen and all waiters leave (including after pin is gone), work still
 * aborts. If `hadNavigation` was already set by A on a shared key and pin was the last
 * ref, `unpin` may still abort — that is sticky navigation policy, not pin arming abort.
 */
export type HandoffWaiterKind = 'navigation' | 'prefetch' | 'pin';

/**
 * One hold on shared prepare work for a resource key ({@link HandoffWorkRegistry.hold}).
 *
 * Call sites wire the load factory to {@link workSignal} and the caller’s own interest
 * (tx / sibling) separately. Cancelling interest only detaches that caller; dropping
 * this hold is {@link release}. {@link workSignal} aborts only via registry idle policy
 * (or {@link HandoffWorkRegistry.destroy}) — not because another waiter released while
 * `refs` remain.
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
   * Drop this hold. Idempotent.
   * Aborts {@link workSignal} only if this was the last hold on the generation and
   * `'navigation'` was seen (even if a prefetch waiter releases last).
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
   * When `refs` hits 0 and this is set → abort and delete.
   * `'prefetch'` / `'pin'` never set this — idle leaves the entry for rejoin
   * (same `workSignal` for a later hold). See {@link HandoffWaiterKind}.
   */
  hadNavigation: boolean;
};

/**
 * Per-key shared work {@link AbortSignal} + waiter refcount for prepare handoff.
 *
 * **Model**
 * - `interest` (tx) — «мне ещё нужен результат»
 * - {@link HandoffWaiter.workSignal} — «общий load ещё жив»
 * - {@link hold} / {@link HandoffWaiter.release | release} — refcount интереса к `workSignal`
 *
 * Cancel interest ≠ abort work. Abort work = последний `release` после того, как на key
 * побывал `'navigation'` (не «last navigation release» — prefetch может уйти последним).
 *
 * | # | Ситуация | Shared |
 * |---|----------|--------|
 * | 1 | Prefetch ушёл, nav ещё держит | жив |
 * | 2 | Prefetch ушёл, nav ещё не пришёл | жив (rejoin) |
 * | 3 | Все ушли, `'navigation'` уже был | abort этого key |
 * | 4 | Только `'pin'` / `'prefetch'` ушли | жив (rejoin) |
 *
 * `'pin'` vs `'prefetch'`: одинаковая abort-полярность (`hadNavigation` не ставится),
 * разная роль — pin не «греет результат», а только держит `refs` на окно supersede.
 * См. {@link HandoffWaiterKind}.
 *
 * Abort — generation одного key, не весь {@link HandoffCache} (кроме {@link destroy}).
 * Owned by {@link HandoffCache}; settled values — в cache, не здесь.
 */
export class HandoffWorkRegistry {
  /**
   * Generations by resource key.
   * Policy-aborted entries are removed; prefetch-idle entries may remain with `refs === 0`.
   */
  private readonly entries = new Map<string, WorkEntry>();

  /**
   * Register a waiter on `key` and return a {@link HandoffWaiter} for that generation.
   *
   * @param key - Resource identity (e.g. `data:…` / `view:…`).
   * @param kind - Interest kind. Only `'navigation'` sets sticky `hadNavigation`.
   * @returns Waiter whose {@link HandoffWaiter.workSignal} is shared for this key’s current generation.
   */
  hold(key: string, kind: HandoffWaiterKind): HandoffWaiter {
    const entry = this.entryFor(key);
    if (kind === 'navigation') entry.hadNavigation = true;
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
   * `0` if the key is absent or only a prefetch-idle generation remains.
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
      hadNavigation: false,
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
    if (entry.refs > 0 || !entry.hadNavigation) return;

    entry.controller.abort();
    this.entries.delete(key);
  }
}

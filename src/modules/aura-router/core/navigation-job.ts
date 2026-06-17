/**
 * In-flight navigation job: one transition from `from` to `to` with cancellation.
 *
 * Distinct from {@link NavigationTransition} in `aura-routing-engine` (route match snapshot only).
 */
export type NavigationIntent = 'push' | 'replace' | 'pop' | 'system';

export class NavigationJob {
  readonly id: number;
  readonly signal: AbortSignal;
  readonly navigationType: NavigationIntent;

  private readonly controller: AbortController;

  constructor(id: number, navigationType: NavigationIntent = 'system') {
    this.id = id;
    this.navigationType = navigationType;
    this.controller = new AbortController();
    this.signal = this.controller.signal;
  }

  get aborted(): boolean {
    return this.signal.aborted;
  }

  abort(reason?: unknown): void {
    if (!this.signal.aborted) {
      this.controller.abort(reason);
    }
  }
}

/**
 * Creates and tracks the active {@link NavigationJob}.
 *
 * Two independent stale guards:
 * - **job** (`id`, `signal`) — superseded by a newer navigation (A→B→C)
 * - **routerGeneration** — router instance was torn down or re-initialized (unmount, `setupRouting`)
 */
export class NavigationJobManager {
  private nextId = 0;
  private _active?: NavigationJob;

  /**
   * Router-instance generation counter (docs: `hookEpoch`).
   *
   * Incremented in {@link invalidate} — NOT on every navigation.
   * Use in `runHooks`: capture before `await`, compare after; if changed, ignore hook result
   * (no redirect / cancel on a dead or re-created router).
   *
   * Unlike {@link NavigationJob}, does not abort in-flight fetch inside the hook —
   * only discards side effects after `await` (React `useEffect` cleanup pattern).
   */
  private _routerGeneration = 0;

  /** Snapshot this before `await` in async hooks; compare with {@link isRouterGeneration} after. */
  get routerGeneration(): number {
    return this._routerGeneration;
  }

  get active(): NavigationJob | undefined {
    return this._active;
  }

  hasActive(): boolean {
    return this._active !== undefined && !this._active.aborted;
  }

  /**
   * Abort the previous job and start a new one.
   * Call at the start of a navigation pipeline (`leave`, `enter` without prior leave, `reentered`).
   */
  begin(): NavigationJob {
    this._active?.abort();
    const job = new NavigationJob(++this.nextId);
    this._active = job;
    return job;
  }

  /**
   * Router teardown / engine re-setup: bump generation and abort the active job.
   * Call from `disconnectedCallback` and `setupRouting`.
   */
  invalidate(): void {
    this._routerGeneration++;
    this._active?.abort();
    this._active = undefined;
  }

  requireActive(): NavigationJob {
    if (!this._active) {
      throw new Error('NavigationJobManager: no active job');
    }
    return this._active;
  }

  isCurrent(job: NavigationJob): boolean {
    return this._active === job && !job.aborted;
  }

  /** Whether `capturedGeneration` is still the current router generation. */
  isRouterGeneration(capturedGeneration: number): boolean {
    return capturedGeneration === this._routerGeneration;
  }

  /**
   * True when async work must be discarded (stale job and/or stale router generation).
   *
   * @param capturedGeneration — value of {@link routerGeneration} taken before `await`
   */
  isStale(job: NavigationJob, capturedGeneration: number): boolean {
    return !this.isRouterGeneration(capturedGeneration) || !this.isCurrent(job);
  }

  /**
   * Resolve job for the current phase — one id per navigation, not per phase.
   */
  resolveForPhase(phase: 'leave' | 'enter' | 'reentered' | string): NavigationJob {
    if (phase === 'leave' || phase === 'reentered') {
      return this.begin();
    }

    if (phase === 'enter' && !this.hasActive()) {
      return this.begin();
    }

    return this.requireActive();
  }
}

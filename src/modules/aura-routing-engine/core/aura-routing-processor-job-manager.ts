import { AuraRoutingProcessorJob } from './aura-routing-processor-job';

/**
 * Creates and tracks the active {@link AuraRoutingProcessorJob}.
 *
 * Two independent stale guards:
 * - **job** (`id`, `signal`) — superseded by a newer navigation (A→B→C)
 * - **routerGeneration** — router instance was torn down or re-initialized (unmount, `setupRouting`)
 */
export class AuraRoutingProcessorJobManager {
  private nextId = 0;
  private _active?: AuraRoutingProcessorJob;

  /**
   * Router-instance generation counter (docs: `hookEpoch`).
   *
   * Incremented in {@link invalidate} — NOT on every navigation.
   * Use in `runHooks`: capture before `await`, compare after; if changed, ignore hook result
   * (no redirect / cancel on a dead or re-created router).
   *
   * Unlike {@link AuraRoutingProcessorJob}, does not abort in-flight fetch inside the hook —
   * only discards side effects after `await` (React `useEffect` cleanup pattern).
   */
  private _routerGeneration = 0;

  /** Snapshot this before `await` in async hooks; compare with {@link isRouterGeneration} after. */
  get routerGeneration(): number {
    return this._routerGeneration;
  }

  get active(): AuraRoutingProcessorJob | undefined {
    return this._active;
  }

  hasActive(): boolean {
    return this._active !== undefined && !this._active.aborted;
  }

  /**
   * Abort the previous job and start a new one.
   * Call at the start of a navigation pipeline (`leave`, `enter` without prior leave, `reentered`).
   */
  begin(): AuraRoutingProcessorJob {
    this._active?.abort();
    const job = new AuraRoutingProcessorJob(++this.nextId);
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

  requireActive(): AuraRoutingProcessorJob {
    if (!this._active) {
      throw new Error('AuraRoutingProcessorJobManager: no active job');
    }
    return this._active;
  }

  isCurrent(job: AuraRoutingProcessorJob): boolean {
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
  isJobSuperseded(job: AuraRoutingProcessorJob, capturedGeneration: number): boolean {
    return !this.isRouterGeneration(capturedGeneration) || !this.isCurrent(job);
  }

}
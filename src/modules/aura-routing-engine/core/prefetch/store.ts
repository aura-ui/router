import { ENGINE_DEFAULTS } from '../aura-routing-engine-config';

import { PrefetchPolicy, type ResolvedPrefetchConfig } from './policy';
import type { PrefetchConfig, PrefetchMode, PrefetchSkipReason } from './types';

type InflightRun = {
  readonly promise: Promise<void>;
  readonly abort: AbortController;
};

type PrefetchRecord = {
  readonly completedAt: number;
};

/** Per-href delayed intent scheduling (hover debounce). */
class IntentScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  schedule(key: string, delayMs: number, run: () => void): void {
    this.cancel(key);

    if (delayMs <= 0) {
      run();
      return;
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      run();
    }, delayMs);

    this.timers.set(key, timer);
  }

  cancel(key?: string): void {
    if (key === undefined) {
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
      return;
    }

    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  has(key: string): boolean {
    return this.timers.has(key);
  }

  destroy(): void {
    this.cancel();
  }
}

/** In-flight runs, stale bookkeeping, and intent timers. */
export class PrefetchRunStore {
  private readonly config: ResolvedPrefetchConfig;
  private readonly policy: PrefetchPolicy;
  private readonly scheduler = new IntentScheduler();
  private readonly inflight = new Map<string, InflightRun>();
  private readonly records = new Map<string, PrefetchRecord>();

  constructor(config: PrefetchConfig = {}) {
    this.config = { ...ENGINE_DEFAULTS.prefetch, ...config };
    this.policy = new PrefetchPolicy(this.config);
  }

  scheduleIntent(href: string, mode: PrefetchMode, run: () => void): void {
    this.scheduler.schedule(href, this.policy.delayFor(mode), run);
  }

  cancelIntent(href?: string): void {
    if (href === undefined) {
      this.scheduler.destroy();
      for (const run of this.inflight.values()) run.abort.abort();
      this.inflight.clear();
      return;
    }

    const normalized = this.policy.normalizeHref(href);
    if (!normalized) return;

    this.scheduler.cancel(normalized);
    this.inflight.get(normalized)?.abort.abort();
  }

  getInflight(href: string): InflightRun | undefined {
    return this.inflight.get(href);
  }

  setInflight(href: string, run: InflightRun): void {
    this.inflight.set(href, run);
  }

  deleteInflight(href: string, abort: AbortController): void {
    if (this.inflight.get(href)?.abort === abort) {
      this.inflight.delete(href);
    }
  }

  isInflight(href: string): boolean {
    return this.inflight.has(href);
  }

  isScheduled(href: string): boolean {
    return this.scheduler.has(href);
  }

  recordSuccess(href: string): void {
    this.records.set(href, { completedAt: Date.now() });
    this.pruneRecords();
  }

  clearRecords(): void {
    this.records.clear();
  }

  clearRecordsMatching(predicate: (href: string) => boolean): void {
    for (const href of this.records.keys()) {
      if (predicate(href)) this.records.delete(href);
    }
  }

  lastCompletedAt(href: string): number | undefined {
    return this.records.get(href)?.completedAt;
  }

  skipReason(href: string, mode: PrefetchMode, force?: boolean): PrefetchSkipReason | null {
    return this.policy.skipReason({
      href,
      mode,
      lastPrefetchAt: this.records.get(href)?.completedAt,
      force,
    });
  }

  destroy(): void {
    this.cancelIntent();
    this.records.clear();
  }

  private pruneRecords(): void {
    const cutoff = Date.now() - this.config.maxAgeMs;
    for (const [href, record] of this.records) {
      if (record.completedAt < cutoff) this.records.delete(href);
    }
  }
}

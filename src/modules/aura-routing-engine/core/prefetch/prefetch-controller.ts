import {
  DEFAULT_MAX_AGE_MS,
  DEFAULT_STALE_TIME_MS,
  delayForMode,
  normalizePrefetchHref,
  shouldSkipPrefetch,
} from './policy';
import { PrefetchIntentScheduler } from './intent-scheduler';
import { resolvePrefetchTarget } from './resolve-target';
import type {
  PrefetchConfig,
  PrefetchControllerDeps,
  PrefetchExecContext,
  PrefetchMode,
  PrefetchOptions,
  PrefetchSkipReason,
  PrefetchTarget,
} from './types';

type InflightRun = {
  readonly promise: Promise<void>;
  readonly abort: AbortController;
};

type PrefetchRecord = {
  readonly completedAt: number;
};

/**
 * Engine-level prefetch orchestrator: match href → parallel sibling executors.
 *
 * Not wired to DOM or navigation yet — intended for link intent + `router.preload(href)`.
 */
export class PrefetchController {
  private readonly deps: PrefetchControllerDeps;
  private readonly config: PrefetchConfig;
  private readonly scheduler = new PrefetchIntentScheduler();
  private readonly inflight = new Map<string, InflightRun>();
  private readonly records = new Map<string, PrefetchRecord>();

  constructor(deps: PrefetchControllerDeps, config: PrefetchConfig = {}) {
    this.deps = deps;
    this.config = config;
  }

  /** Schedule prefetch after mode-specific delay (link hover / viewport). */
  scheduleIntent(href: string, mode?: PrefetchMode): void {
    const resolvedMode = mode ?? this.config.defaultMode ?? 'intent';
    const normalized = normalizePrefetchHref(href);
    if (!normalized) return;

    const skip = this.skipReason(normalized, resolvedMode);
    if (skip) {
      this.config.onSkipped?.(normalized, skip);
      return;
    }

    const delayMs = delayForMode(resolvedMode, this.config);
    this.scheduler.schedule(normalized, delayMs, () => {
      void this.prefetch(normalized, { mode: resolvedMode, reason: resolvedMode });
    });
  }

  /** Cancel pending intent timer and abort in-flight prefetch for href (or all). */
  cancelIntent(href?: string): void {
    if (href === undefined) {
      this.scheduler.destroy();
      for (const run of this.inflight.values()) run.abort.abort();
      this.inflight.clear();
      return;
    }

    const normalized = normalizePrefetchHref(href);
    if (!normalized) return;

    this.scheduler.cancel(normalized);
    this.inflight.get(normalized)?.abort.abort();
  }

  /** Immediate prefetch — manual API, viewport after visible, post-schedule intent. */
  async prefetch(href: string, options: PrefetchOptions = {}): Promise<void> {
    const mode = options.mode ?? 'manual';
    const normalized = normalizePrefetchHref(href);
    if (!normalized) return;

    const skip = this.skipReason(normalized, mode, options.force);
    if (skip) {
      this.config.onSkipped?.(normalized, skip);
      return;
    }

    const existing = !options.force ? this.inflight.get(normalized) : undefined;
    if (existing) return existing.promise;

    const target = resolvePrefetchTarget(
      this.deps.matcher,
      this.deps.getMatchableNodes(),
      normalized,
    );
    if (!target) {
      this.config.onSkipped?.(normalized, 'no-match');
      return;
    }

    const abort = new AbortController();
    const ctx: PrefetchExecContext = {
      signal: abort.signal,
      mode,
      reason: options.reason ?? mode,
    };

    options.signal?.addEventListener('abort', () => abort.abort(), { once: true });

    const promise = this.runExecutors(target, ctx);
    this.inflight.set(normalized, { promise, abort });

    try {
      await promise;
      this.records.set(normalized, { completedAt: Date.now() });
      this.pruneRecords();
    } catch (error) {
      if (!abort.signal.aborted) {
        this.config.onError?.(target, error, ctx);
        if (mode === 'manual') throw error;
      }
    } finally {
      if (this.inflight.get(normalized)?.abort === abort) {
        this.inflight.delete(normalized);
      }
    }
  }

  isInflight(href: string): boolean {
    const normalized = normalizePrefetchHref(href);
    return normalized ? this.inflight.has(normalized) : false;
  }

  isScheduled(href: string): boolean {
    const normalized = normalizePrefetchHref(href);
    return normalized ? this.scheduler.has(normalized) : false;
  }

  destroy(): void {
    this.cancelIntent();
    this.records.clear();
  }

  private skipReason(href: string, mode: PrefetchMode, force?: boolean): PrefetchSkipReason | null {
    return shouldSkipPrefetch({
      href,
      mode,
      config: this.config,
      lastPrefetchAt: this.records.get(href)?.completedAt,
      force,
    });
  }

  private async runExecutors(target: PrefetchTarget, ctx: PrefetchExecContext): Promise<void> {
    if (ctx.signal.aborted) return;

    this.deps.speculation?.hint(target, ctx);
    this.config.onStart?.(target, ctx);

    const tasks: Promise<void>[] = [];
    if (this.deps.content) tasks.push(this.deps.content.prefetch(target, ctx));
    if (this.deps.data) tasks.push(this.deps.data.prefetch(target, ctx));

    if (tasks.length === 0) return;

    await Promise.all(tasks);

    if (ctx.signal.aborted) return;
    this.config.onComplete?.(target, ctx);
  }

  private pruneRecords(): void {
    const maxAge = this.config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    const cutoff = Date.now() - maxAge;
    for (const [href, record] of this.records) {
      if (record.completedAt < cutoff) this.records.delete(href);
    }
  }
}

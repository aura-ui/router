import {
  DEFAULT_MAX_AGE_MS,
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
    if (!normalized) {
      this.config.onSkipped?.(href, 'invalid-href');
      return;
    }

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

    if (options.force) {
      this.inflight.get(normalized)?.abort.abort();
    }

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
      const completed = await promise;
      if (!completed || abort.signal.aborted) return;
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

  private async runExecutors(target: PrefetchTarget, ctx: PrefetchExecContext): Promise<boolean> {
    if (ctx.signal.aborted) return false;

    const tasks: Promise<void>[] = [];
    if (this.deps.content) tasks.push(this.deps.content.prefetch(target, ctx));
    if (this.deps.data) tasks.push(this.deps.data.prefetch(target, ctx));

    if (tasks.length === 0) return false;

    this.deps.speculation?.hint(target, ctx);
    this.config.onStart?.(target, ctx);

    try {
      await raceWithAbort(Promise.all(tasks), ctx.signal);
    } catch (error) {
      if (ctx.signal.aborted || isAbortError(error)) return false;
      throw error;
    }

    if (ctx.signal.aborted) return false;

    this.config.onComplete?.(target, ctx);
    return true;
  }

  private pruneRecords(): void {
    const maxAge = this.config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    const cutoff = Date.now() - maxAge;
    for (const [href, record] of this.records) {
      if (record.completedAt < cutoff) this.records.delete(href);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Prefetch aborted', 'AbortError'));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Prefetch aborted', 'AbortError'));

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

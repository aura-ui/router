import { PrefetchPolicy } from './policy';
import { PrefetchPlanResolver } from './plan';
import { PrefetchRunStore } from './store';
import { PrefetchIntentBus } from './intent/bus';
import { LinkIntentSource } from './intent/link-source';
import type {
  PrefetchConfig,
  PrefetchIntent,
  PrefetchMode,
  PrefetchOptions,
  PrefetchPipelineDeps,
  PrefetchPlan,
  PrefetchRunContext,
} from './types';

/**
 * Prefetch orchestrator: intent bus → policy → plan → resolve resources → scheduler.
 */
export class PrefetchPipeline {
  private readonly deps: PrefetchPipelineDeps;
  private readonly config: PrefetchConfig;
  private readonly policy: PrefetchPolicy;
  private readonly store: PrefetchRunStore;
  private readonly planResolver: PrefetchPlanResolver;
  private readonly intentBus = new PrefetchIntentBus();
  private readonly linkSource: LinkIntentSource;
  private readonly unsubscribeIntent: () => void;

  constructor(
    deps: PrefetchPipelineDeps,
    config: PrefetchConfig = {},
    options: { linksSelector?: string } = {},
  ) {
    this.deps = deps;
    this.config = config;
    this.policy = new PrefetchPolicy(config);
    this.store = new PrefetchRunStore(config);
    this.planResolver = new PrefetchPlanResolver({
      matcher: deps.matcher,
      getMatchableNodes: deps.getMatchableNodes,
      getRegistryGeneration: deps.getRegistryGeneration,
      currentHref: config.currentHref,
    });

    this.unsubscribeIntent = this.intentBus.subscribe((intent) => this.handleIntent(intent));

    this.linkSource = new LinkIntentSource(this.intentBus, {
      linksSelector: options.linksSelector,
      defaultMode: config.defaultMode,
    });
  }

  get intent(): PrefetchIntentBus {
    return this.intentBus;
  }

  start(): void {
    this.linkSource.start();
  }

  scheduleIntent(href: string, mode?: PrefetchMode): void {
    this.handleIntent({ type: 'schedule', href, mode, source: 'api' });
  }

  cancelIntent(href?: string): void {
    this.handleIntent({ type: 'cancel', href, source: 'api' });
  }

  async prefetch(href: string, options: PrefetchOptions = {}): Promise<void> {
    const mode = options.mode ?? 'manual';
    const normalized = this.resolveRunnableHref(href, mode, {
      force: options.force,
      onSkip: true,
    });
    if (!normalized) return;

    const existing = !options.force ? this.store.getInflight(normalized) : undefined;
    if (existing) return existing.promise;

    if (options.force) {
      this.store.getInflight(normalized)?.abort.abort();
    }

    const plan = this.planResolver.resolve(normalized);
    if (!plan) {
      this.config.onSkipped?.(normalized, 'no-match');
      return;
    }

    const abort = new AbortController();
    const ctx: PrefetchRunContext = { signal: abort.signal, mode };

    options.signal?.addEventListener('abort', () => abort.abort(), { once: true });

    const runPromise = this.runResources(plan, ctx);
    const promise = runPromise.then(
      () => undefined,
      () => undefined,
    );
    this.store.setInflight(normalized, { promise, abort });

    try {
      const completed = await runPromise;
      if (!completed || abort.signal.aborted) return;
      this.store.recordSuccess(normalized);
    } catch (error) {
      if (!abort.signal.aborted) {
        this.config.onError?.(plan, error, ctx);
        if (mode === 'manual') throw error;
      }
    } finally {
      this.store.deleteInflight(normalized, abort);
    }
  }

  isInflight(href: string): boolean {
    const normalized = this.policy.normalizeHref(href);
    return normalized ? this.store.isInflight(normalized) : false;
  }

  isScheduled(href: string): boolean {
    const normalized = this.policy.normalizeHref(href);
    return normalized ? this.store.isScheduled(normalized) : false;
  }

  destroy(): void {
    this.unsubscribeIntent();
    this.linkSource.destroy();
    this.intentBus.destroy();
    this.store.destroy();
    this.planResolver.clear();
  }

  private handleIntent(intent: PrefetchIntent): void {
    this.config.onIntent?.(intent);

    if (intent.type === 'cancel') {
      this.store.cancelIntent(intent.href);
      return;
    }

    const resolvedMode = intent.mode ?? this.config.defaultMode ?? 'intent';
    const normalized = this.resolveRunnableHref(intent.href, resolvedMode, { onSkip: true });
    if (!normalized) return;

    this.store.scheduleIntent(
      normalized,
      resolvedMode,
      () => void this.prefetch(normalized, { mode: resolvedMode }),
    );
  }

  private resolveRunnableHref(
    href: string,
    mode: PrefetchMode,
    opts: { force?: boolean; onSkip?: boolean },
  ): string | null {
    const normalized = this.policy.normalizeHref(href);
    if (!normalized) {
      if (opts.onSkip) this.config.onSkipped?.(href, 'invalid-href');
      return null;
    }

    const skip = this.store.skipReason(normalized, mode, opts.force);
    if (skip) {
      if (opts.onSkip) this.config.onSkipped?.(normalized, skip);
      return null;
    }

    return normalized;
  }

  private async runResources(plan: PrefetchPlan, ctx: PrefetchRunContext): Promise<boolean> {
    if (ctx.signal.aborted) return false;

    const planCtx = { mode: ctx.mode, confidence: this.policy.confidenceFor(ctx.mode) };
    const resources = this.deps.planner.planResources(plan, planCtx);

    if (!resources.length) {
      const reason = this.deps.planner.explainEmptyPlan?.(plan, planCtx) ?? 'no-targets';
      this.config.onSkipped?.(plan.href, reason);
      return false;
    }

    this.deps.speculation?.hint(plan, ctx);
    this.config.onStart?.(plan, ctx);

    try {
      await this.raceWithAbort(
        this.deps.scheduler.run(resources, {
          signal: ctx.signal,
          ...planCtx,
        }),
        ctx.signal,
      );
    } catch (error) {
      if (ctx.signal.aborted || this.isAbortError(error)) return false;
      throw error;
    }

    if (ctx.signal.aborted) return false;

    this.config.onComplete?.(plan, ctx);
    return true;
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  private raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
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
}

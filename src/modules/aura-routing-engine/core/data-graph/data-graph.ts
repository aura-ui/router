import { AuraResolvableCache } from '../../../aura-cache-store/core/aura-resolvable-cache';
import { DEFAULT_GC_TIME } from '../../../aura-cache-store/core/aura-cache-store';
import type { GuardResult } from '../guard.types';
import { runPhaseHooks, type HookRegistry } from '../hooks/registry';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { PipelineStepOutcome } from '../lifecycle/execution/phase-outcome';
import { guardResultToPhaseOutcome } from '../lifecycle/execution/phase-outcome';
import { resolveHookNames } from '../lifecycle/bindings/route-hook-bindings';
import {
  createLifecycleContext,
  type LifecycleContextInput,
} from '../lifecycle/context/lifecycle-context';
import { ErrorPhaseHandler } from '../lifecycle/orchestration/error-phase-handler';
import type { LifecycleRuntimeContext } from '../lifecycle/orchestration/lifecycle-runner.types';
import { toLifecycleContextInput } from '../lifecycle/orchestration/lifecycle-runtime-adapter';
import type { TransactionResult } from '../navigation/transaction-result';
import { routeMatchKey } from '../route-tree/matched-chain';

/** Cached marker when load hooks complete without returning payload data. */
const LOAD_OK = true as const;

export type DataSnapshot = ReadonlyMap<string, unknown>;

export type DataGraphOptions = {
  /** SWR fresh window (ms). Default: 30_000. */
  staleTime?: number;
  /** Max age before eviction (ms). Default: {@link DEFAULT_GC_TIME}. */
  gcTime?: number;
};

export type DataGraphLoadOptions = {
  chain?: readonly MatchedRouteInfo[];
  runtime: LifecycleRuntimeContext;
};

export type DataGraphPrefetchOptions = {
  signal?: AbortSignal;
  mode: 'intent';
};

class DataGraphTerminalError extends Error {
  readonly outcome: TransactionResult;

  constructor(outcome: TransactionResult) {
    super('DataGraph terminal hook outcome');
    this.name = 'DataGraphTerminalError';
    this.outcome = outcome;
  }
}

/**
 * Coordinator for route `load` hooks: parallel branch loads, SWR cache, prefetch intent.
 * View/HTML caching stays in `core/content/`.
 */
export class DataGraph {
  private readonly cache: AuraResolvableCache<unknown>;
  private readonly errorHandler = new ErrorPhaseHandler();
  private readonly hooks: HookRegistry;

  constructor(hooks: HookRegistry, options: DataGraphOptions = {}) {
    this.hooks = hooks;
    this.cache = new AuraResolvableCache({
      staleTime: options.staleTime ?? 30_000,
      gcTime: options.gcTime ?? DEFAULT_GC_TIME,
      gcSweepInterval: false,
    });
  }

  /** Blocking navigation load — after guards, before render. */
  async load(
    targets: readonly MatchedRouteInfo[],
    options: DataGraphLoadOptions,
  ): Promise<PipelineStepOutcome> {
    const routes = targets.filter((route) => route.route.load?.length);
    if (!routes.length) return null;

    const outcomes = await Promise.all(
      routes.map((route) => this.ensureNavigationLoad(route, options.runtime)),
    );

    for (const outcome of outcomes) {
      if (outcome) return outcome;
    }

    void this.snapshot(options.chain ?? routes);
    return null;
  }

  /** Intent prefetch — guards skipped; redirect/cancel/errors ignored. */
  async prefetch(
    targets: readonly MatchedRouteInfo[],
    options: DataGraphPrefetchOptions,
  ): Promise<void> {
    const routes = targets.filter((route) => route.route.load?.length);
    await Promise.all(routes.map((route) => this.prefetchRoute(route, options.signal)));
  }

  invalidate(key: string): void {
    this.cache.invalidate(key, 'remove');
  }

  invalidateMatch(predicate: (key: string) => boolean): void {
    this.cache.invalidateMatch(predicate, 'remove');
  }

  invalidateAll(): void {
    this.cache.invalidateAll('remove');
  }

  snapshot(chain: readonly MatchedRouteInfo[]): DataSnapshot {
    const data = new Map<string, unknown>();

    for (const route of chain) {
      const hookNames = resolveHookNames(route.route, 'load');
      if (!hookNames?.length) continue;

      const key = this.cacheKey(route, hookNames);
      const value = this.cache.get(key);
      if (value !== undefined) data.set(key, value);
    }

    return data;
  }

  destroy(): void {
    this.cache.destroy();
  }

  private async ensureNavigationLoad(
    route: MatchedRouteInfo,
    runtime: LifecycleRuntimeContext,
  ): Promise<PipelineStepOutcome> {
    const hookNames = resolveHookNames(route.route, 'load');
    if (!hookNames?.length) return null;

    const key = this.cacheKey(route, hookNames);

    try {
      await this.cache.resolve(key, () =>
        this.runLoadHooks(
          route,
          hookNames,
          toLifecycleContextInput(runtime),
          runtime.isJobActive,
          false,
          runtime.hookRegistry,
        ),
      );
      return null;
    } catch (error) {
      if (error instanceof DataGraphTerminalError) return error.outcome;
      if (!runtime.isJobActive()) return { status: 'cancelled' };
      return this.errorHandler.failNavigation(route, error, 'load', runtime);
    }
  }

  private async prefetchRoute(route: MatchedRouteInfo, signal?: AbortSignal): Promise<void> {
    const abort = signal ?? new AbortController().signal;
    if (abort.aborted) return;

    const hookNames = resolveHookNames(route.route, 'load');
    if (!hookNames?.length) return;

    const key = this.cacheKey(route, hookNames);
    const input = this.prefetchContextInput(abort);

    try {
      await this.cache.resolve(key, () =>
        this.runLoadHooks(route, hookNames, input, () => !abort.aborted, true),
      );
    } catch {
      // intent: silent
    }
  }

  private prefetchContextInput(signal: AbortSignal): LifecycleContextInput {
    return {
      from: null,
      action: 'push',
      router: { navigate: () => {} },
      navigationJob: { id: 0, signal },
    };
  }

  private async runLoadHooks(
    route: MatchedRouteInfo,
    hookNames: readonly string[],
    input: LifecycleContextInput,
    isJobActive: () => boolean,
    soft = false,
    hookRegistry: HookRegistry = this.hooks,
  ): Promise<unknown> {
    const lifecycleContext = createLifecycleContext('load', route, input);

    const hookResult: GuardResult = await runPhaseHooks(
      hookRegistry,
      lifecycleContext,
      hookNames,
      isJobActive,
    );

    const terminal = guardResultToPhaseOutcome(hookResult);
    if (terminal) {
      if (soft) throw new Error('prefetch ignored terminal');
      throw new DataGraphTerminalError(terminal);
    }

    route.route.onLoad(lifecycleContext);
    return LOAD_OK;
  }

  private cacheKey(route: MatchedRouteInfo, hookNames: readonly string[]): string {
    const parts = [routeMatchKey(route), hookNames.join(',')];

    if (route.params && Object.keys(route.params).length) {
      parts.push(this.encodeRecord(route.params));
    }

    if (route.query && Object.keys(route.query).length) {
      parts.push(this.encodeRecord(route.query));
    }

    return parts.join('|');
  }

  private encodeRecord(record: Record<string, string>): string {
    return Object.keys(record)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(record[key]!)}`)
      .join('&');
  }
}

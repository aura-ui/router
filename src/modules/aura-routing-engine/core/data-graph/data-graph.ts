import { AuraResolvableCache } from '../../../aura-cache-store/core/aura-resolvable-cache';
import { DEFAULT_GC_TIME, type InvalidatePolicy } from '../../../aura-cache-store/core/aura-cache-store';
import { normalizeHookResult, type HookRegistry } from '../hooks/registry';
import type { HookResultInput } from '../hooks/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { PipelineStepOutcome } from '../lifecycle/execution/phase-outcome';
import { guardResultToPhaseOutcome } from '../lifecycle/execution/phase-outcome';
import {
  createLifecycleContext,
  toLifecycleContextInput,
  type LifecycleContextInput,
} from '../lifecycle/context/lifecycle-context';
import { ErrorPhaseHandler } from '../lifecycle/orchestration/error-phase-handler';
import type { LifecycleRuntimeContext } from '../lifecycle/orchestration/lifecycle-runtime.types';
import type { RouteLifecycleContext } from '../route/types';
import { buildRouteDataKey, routeHasLoadHooks, routeLoadHookNames } from './route-data';

export type DataSnapshot = ReadonlyMap<string, unknown>;

export type DataGraphLoadResult = {
  outcome?: PipelineStepOutcome;
  /** Set when load step completes; omitted on redirect / cancel / error. */
  snapshot?: DataSnapshot;
};

export type DataGraphOptions = {
  /** SWR fresh window (ms). Default: 30_000. */
  staleTime?: number;
  /** Max age before eviction (ms). Default: {@link DEFAULT_GC_TIME}. */
  gcTime?: number;
};

export type DataGraphLoadOptions = {
  /**
   * Full active branch (root → leaf) for snapshot lookup.
   * Includes LCA parents outside {@link load} enterRoutes (cache hits without re-fetch).
   */
  activeChain?: readonly MatchedRouteInfo[];
  runtime: LifecycleRuntimeContext;
};

export type DataGraphPrefetchOptions = {
  signal?: AbortSignal;
  mode: 'intent';
};

type LoadHookMode = 'navigation' | 'prefetch';

type RouteLoadDescriptor = {
  hookNames: readonly string[];
  key: string;
};

type TerminalOutcome = Exclude<PipelineStepOutcome, null>;

class DataGraphTerminalError extends Error {
  readonly outcome: TerminalOutcome;

  constructor(outcome: TerminalOutcome) {
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
  private readonly errorHandler: ErrorPhaseHandler;
  /** Engine hook registry; prefetch uses this (no navigation runtime). */
  private readonly hooks: HookRegistry;

  constructor(hooks: HookRegistry, options: DataGraphOptions = {}) {
    this.hooks = hooks;
    this.cache = new AuraResolvableCache({
      staleTime: options.staleTime ?? 30_000,
      gcTime: options.gcTime ?? DEFAULT_GC_TIME,
      gcSweepInterval: false,
    });
    this.errorHandler = new ErrorPhaseHandler();
  }

  /**
   * Blocking navigation load — after guards, before render.
   * @param enterRoutes Routes entering this transition (LCA delta); load hooks run only here.
   */
  async load(enterRoutes: readonly MatchedRouteInfo[], options: DataGraphLoadOptions): Promise<DataGraphLoadResult> {
    const activeChain = options.activeChain ?? enterRoutes;
    const enterRoutesWithLoadHooks = this.filterRoutesWithLoadHooks(enterRoutes);

    if (!enterRoutesWithLoadHooks.length) {
      return { snapshot: this.snapshot(activeChain) };
    }

    const terminal = await this.runParallelNavigationLoads(enterRoutesWithLoadHooks, options.runtime);
    if (terminal) {
      return { outcome: terminal };
    }

    return { snapshot: this.snapshot(activeChain) };
  }

  /** Intent prefetch — guards skipped; redirect/cancel/errors ignored. */
  async prefetch(
    routes: readonly MatchedRouteInfo[],
    options: DataGraphPrefetchOptions,
  ): Promise<void> {
    const routesWithLoadHooks = this.filterRoutesWithLoadHooks(routes);
    await Promise.all(routesWithLoadHooks.map((route) => this.prefetchRoute(route, options.signal)));
  }

  invalidate(key: string, policy: InvalidatePolicy = 'remove'): boolean {
    return this.cache.invalidate(key, policy);
  }

  invalidateMatch(predicate: (key: string) => boolean, policy: InvalidatePolicy = 'remove'): number {
    return this.cache.invalidateMatch(predicate, policy);
  }

  invalidateAll(policy: InvalidatePolicy = 'remove'): number {
    return this.cache.invalidateAll(policy);
  }

  /** Reads cached load-hook payloads for every route on the active branch. */
  snapshot(activeChain: readonly MatchedRouteInfo[]): DataSnapshot {
    const data = new Map<string, unknown>();

    for (const route of activeChain) {
      if (!routePreservesLoadData(route)) continue;

      const descriptor = this.buildRouteLoadDescriptor(route);
      if (!descriptor) continue;

      const value = this.cache.get(descriptor.key);
      if (value !== undefined) {
        data.set(descriptor.key, value);
      }
    }

    return data;
  }

  destroy(): void {
    this.cache.destroy();
  }

  /**
   * Parallel sibling abort: on redirect/cancel/error, abort in-flight loads on other enter routes.
   * To allow parallel loads to finish despite a terminal sibling, remove `siblingAbort` wiring
   * and pass only `runtime.isJobActive` into `ensureNavigationLoad`.
   */
  private async runParallelNavigationLoads(
    enterRoutesWithLoadHooks: readonly MatchedRouteInfo[],
    runtime: LifecycleRuntimeContext,
  ): Promise<PipelineStepOutcome> {
    const siblingAbort = new AbortController();
    const loadRuntime = this.withSiblingAbort(runtime, siblingAbort);
    const outcomes: PipelineStepOutcome[] = [];

    await Promise.all(
      enterRoutesWithLoadHooks.map(async (route, index) => {
        outcomes[index] = await this.ensureNavigationLoad(route, loadRuntime, siblingAbort);
        if (outcomes[index]) {
          siblingAbort.abort();
        }
      }),
    );

    return outcomes.find((outcome) => outcome) ?? null;
  }

  private withSiblingAbort(
    runtime: LifecycleRuntimeContext,
    siblingAbort: AbortController,
  ): LifecycleRuntimeContext {
    const base = toLifecycleContextInput(runtime);
    return {
      ...runtime,
      navigationJob: {
        ...runtime.navigationJob,
        signal: AbortSignal.any([base.navigationJob.signal, siblingAbort.signal]),
      },
    };
  }

  private async ensureNavigationLoad(
    route: MatchedRouteInfo,
    runtime: LifecycleRuntimeContext,
    siblingAbort: AbortController,
  ): Promise<PipelineStepOutcome> {
    const descriptor = this.buildRouteLoadDescriptor(route);
    if (!descriptor) return null;

    const input = toLifecycleContextInput(runtime);
    const ctx = this.loadContext(route, input);
    const isActive = () => runtime.isJobActive() && !siblingAbort.signal.aborted;

    try {
      await this.resolveRouteLoad(route, descriptor, () =>
        this.runLoadPhaseHooks(runtime.hookRegistry, ctx, descriptor.hookNames, isActive, 'navigation'),
      );

      // Immutable pipeline step: onLoad runs on every navigation, including cache hits.
      route.route.onLoad(ctx);
      return null;
    } catch (error) {
      if (error instanceof DataGraphTerminalError) return error.outcome;
      if (!isActive()) return { status: 'cancelled' };
      return this.errorHandler.failNavigation(route, error, 'load', runtime);
    }
  }

  private async prefetchRoute(route: MatchedRouteInfo, signal?: AbortSignal): Promise<void> {
    const abort = signal ?? new AbortController().signal;
    if (abort.aborted) return;

    const descriptor = this.buildRouteLoadDescriptor(route);
    if (!descriptor) return;

    const ctx = this.loadContext(route, this.prefetchContextInput(abort));

    try {
      await this.resolveRouteLoad(route, descriptor, () =>
        this.runLoadPhaseHooks(this.hooks, ctx, descriptor.hookNames, () => !abort.aborted, 'prefetch'),
      );
    } catch {
      // intent: silent
    }
  }

  private filterRoutesWithLoadHooks(routes: readonly MatchedRouteInfo[]): MatchedRouteInfo[] {
    return routes.filter(routeHasLoadHooks);
  }

  private async resolveRouteLoad(
    route: MatchedRouteInfo,
    descriptor: RouteLoadDescriptor,
    load: () => Promise<unknown>,
  ): Promise<void> {
    if (routePreservesLoadData(route)) {
      await this.cache.resolve(descriptor.key, load);
    } else {
      await load();
    }
  }

  private buildRouteLoadDescriptor(route: MatchedRouteInfo): RouteLoadDescriptor | null {
    const hookNames = routeLoadHookNames(route);
    if (!hookNames) return null;

    return { hookNames, key: buildRouteDataKey(route, hookNames) };
  }

  private loadContext(route: MatchedRouteInfo, input: LifecycleContextInput): RouteLifecycleContext {
    return createLifecycleContext('load', route, input);
  }

  private prefetchContextInput(signal: AbortSignal): LifecycleContextInput {
    return {
      from: null,
      action: 'push',
      router: {
        navigate: () => {
        },
      },
      navigationJob: { id: 0, signal },
    };
  }

  /**
   * Runs load hooks sequentially; caches hook payload (last non-terminal return).
   * Does not invoke `onLoad` — caller runs it after cache resolve.
   */
  private async runLoadPhaseHooks(
    hookRegistry: HookRegistry,
    lifecycleContext: RouteLifecycleContext,
    hookNames: readonly string[],
    isJobActive: () => boolean,
    mode: LoadHookMode,
  ): Promise<unknown> {
    let payload: unknown = null;

    for (const name of hookNames) {
      this.assertJobActive(isJobActive, mode);

      const entry = hookRegistry.get(name);
      if (!entry) {
        console.warn(
          `Unknown hook "${name}" on route ${lifecycleContext.route.path} (phase ${lifecycleContext.phase})`,
        );
        continue;
      }

      const raw = await entry.fn({ ...lifecycleContext, options: entry.options });
      this.assertJobActive(isJobActive, mode);

      const terminal = guardResultToPhaseOutcome(normalizeHookResult(raw as HookResultInput));
      this.throwIfTerminal(terminal, mode);

      const data = extractLoadPayload(raw);
      if (data !== SKIP_PAYLOAD) {
        payload = data;
      }
    }

    return payload;
  }

  private assertJobActive(isJobActive: () => boolean, mode: LoadHookMode): void {
    if (isJobActive()) return;

    if (mode === 'prefetch') throw new Error('prefetch aborted');
    throw new DataGraphTerminalError({ status: 'cancelled' });
  }

  private throwIfTerminal(terminal: PipelineStepOutcome, mode: LoadHookMode): void {
    if (!terminal) return;

    if (mode === 'prefetch') throw new Error('prefetch ignored terminal');
    throw new DataGraphTerminalError(terminal);
  }
}

const SKIP_PAYLOAD = Symbol('skip-payload');

function routePreservesLoadData(route: MatchedRouteInfo): boolean {
  return route.route.preserve?.data ?? false;
}

/** Non-terminal hook return stored in the data graph cache. */
function extractLoadPayload(raw: unknown): unknown {
  if (raw === undefined || raw === true || raw === false) return SKIP_PAYLOAD;

  const normalized = normalizeHookResult(raw as HookResultInput);
  if (normalized === false || typeof normalized === 'string') return SKIP_PAYLOAD;
  if (typeof normalized === 'object' && normalized !== null && 'url' in normalized) return SKIP_PAYLOAD;

  if (typeof raw === 'object' && raw !== null && 'type' in raw) {
    const { type } = raw as { type: string };
    if (type === 'continue' || type === 'cancel' || type === 'redirect') return SKIP_PAYLOAD;
  }

  return raw;
}

import { AuraResolvableCache } from '../../../aura-cache-store/core/aura-resolvable-cache';
import { DEFAULT_GC_TIME, type InvalidatePolicy } from '../../../aura-cache-store/core/aura-cache-store';
import { normalizeHookResult, type HookRegistry } from '../hooks/registry';
import type { HookResultInput } from '../hooks/types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { PipelineStepOutcome } from '../lifecycle/execution/phase-outcome';
import { guardResultToPhaseOutcome } from '../lifecycle/execution/phase-outcome';
import type { PreserveFlags } from '../content/model/preserve';
import {
  createLifecycleContext,
  type LifecycleContextInput,
} from '../lifecycle/context/lifecycle-context';
import { ErrorPhaseHandler } from '../lifecycle/orchestration/error-phase-handler';
import type { LifecycleRuntimeContext } from '../lifecycle/orchestration/lifecycle-runtime.types';
import { toLifecycleContextInput } from '../lifecycle/context/lifecycle-context';
import type { RouteLifecycleContext } from '../route/types';
import type { TransactionResult } from '../navigation/transaction-result';
import { buildRouteDataKey, routeHasLoadHooks, routeLoadHookNames } from './route-data';

export type DataSnapshot = ReadonlyMap<string, unknown>;

export type DataGraphLoadResult = {
  outcome: PipelineStepOutcome;
  /** Present only when load step completed; absent on redirect / cancel / error. */
  snapshot?: DataSnapshot;
};

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

type LoadHookMode = 'navigation' | 'prefetch';

type LoadTarget = {
  hookNames: readonly string[];
  key: string;
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
  private readonly errorHandler: ErrorPhaseHandler;
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

  /** Blocking navigation load — after guards, before render. */
  async load(
    enterRoutes: readonly MatchedRouteInfo[],
    options: DataGraphLoadOptions,
  ): Promise<DataGraphLoadResult> {
    const activeChain = options.chain ?? enterRoutes;
    const routesWithLoad = this.routesWithLoadHooks(enterRoutes);

    if (!routesWithLoad.length) {
      return this.loadSucceeded(activeChain);
    }

    const terminal = await this.runParallelNavigationLoads(routesWithLoad, options.runtime);
    if (terminal) {
      return { outcome: terminal };
    }

    return this.loadSucceeded(activeChain);
  }

  /** Intent prefetch — guards skipped; redirect/cancel/errors ignored. */
  async prefetch(
    targets: readonly MatchedRouteInfo[],
    options: DataGraphPrefetchOptions,
  ): Promise<void> {
    const routes = this.routesWithLoadHooks(targets);
    await Promise.all(routes.map((route) => this.prefetchRoute(route, options.signal)));
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

  snapshot(chain: readonly MatchedRouteInfo[]): DataSnapshot {
    const data = new Map<string, unknown>();

    for (const route of chain) {
      if (!routePreservesLoadData(route)) continue;

      const target = this.resolveLoadTarget(route);
      if (!target) continue;

      const value = this.cache.get(target.key);
      if (value !== undefined) {
        data.set(target.key, value);
      }
    }

    return data;
  }

  destroy(): void {
    this.cache.destroy();
  }

  private loadSucceeded(chain: readonly MatchedRouteInfo[]): DataGraphLoadResult {
    return { outcome: null, snapshot: this.snapshot(chain) };
  }

  /**
   * Parallel sibling abort: on redirect/cancel/error, abort in-flight loads on other targets.
   * To allow parallel loads to finish despite a terminal sibling, remove `siblingAbort` wiring
   * and pass only `runtime.isJobActive` into `ensureNavigationLoad`.
   */
  private async runParallelNavigationLoads(
    routes: readonly MatchedRouteInfo[],
    runtime: LifecycleRuntimeContext,
  ): Promise<PipelineStepOutcome> {
    const siblingAbort = new AbortController();
    const loadRuntime = this.withSiblingAbort(runtime, siblingAbort);
    const outcomes: PipelineStepOutcome[] = [];

    await Promise.all(
      routes.map(async (route, index) => {
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
        signal: mergeAbortSignals(base.navigationJob.signal, siblingAbort.signal),
      },
    };
  }

  private async ensureNavigationLoad(
    route: MatchedRouteInfo,
    runtime: LifecycleRuntimeContext,
    siblingAbort: AbortController,
  ): Promise<PipelineStepOutcome> {
    const target = this.resolveLoadTarget(route);
    if (!target) return null;

    const input = toLifecycleContextInput(runtime);
    const ctx = this.loadContext(route, input);
    const isActive = () => runtime.isJobActive() && !siblingAbort.signal.aborted;

    try {
      const load = () =>
        this.runLoadPhaseHooks(runtime.hookRegistry, ctx, target.hookNames, isActive, 'navigation');

      if (routePreservesLoadData(route)) {
        await this.cache.resolve(target.key, load);
      } else {
        await load();
      }

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

    const target = this.resolveLoadTarget(route);
    if (!target) return;

    const ctx = this.loadContext(route, this.prefetchContextInput(abort));

    try {
      const load = () =>
        this.runLoadPhaseHooks(this.hooks, ctx, target.hookNames, () => !abort.aborted, 'prefetch');

      if (routePreservesLoadData(route)) {
        await this.cache.resolve(target.key, load);
      } else {
        await load();
      }
    } catch {
      // intent: silent
    }
  }

  private routesWithLoadHooks(targets: readonly MatchedRouteInfo[]): MatchedRouteInfo[] {
    return targets.filter(routeHasLoadHooks);
  }

  private resolveLoadTarget(route: MatchedRouteInfo): LoadTarget | null {
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
  return (route.route as { preserve?: PreserveFlags }).preserve?.data ?? false;
}

/** Non-terminal hook return stored in the data graph cache. */
function extractLoadPayload(raw: unknown): unknown {
  if (raw === undefined || raw === true || raw === false) return SKIP_PAYLOAD;
  if (typeof raw === 'string') return SKIP_PAYLOAD;
  if (typeof raw === 'object' && raw !== null && 'type' in raw) return SKIP_PAYLOAD;
  return raw;
}

function mergeAbortSignals(primary: AbortSignal, secondary: AbortSignal): AbortSignal {
  if (primary.aborted) return primary;
  if (secondary.aborted) return secondary;

  const merged = new AbortController();
  const abort = (): void => merged.abort();

  primary.addEventListener('abort', abort, { once: true });
  secondary.addEventListener('abort', abort, { once: true });

  return merged.signal;
}

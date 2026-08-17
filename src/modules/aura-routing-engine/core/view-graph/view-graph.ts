import type { SwrCacheOptions } from '../../../aura-cache/core';
import { AuraResolvableSwrCache } from '../../../aura-cache/core/aura-resolvable-swr-cache';
import type { CacheFlags } from '../../../aura-route/core/attr/cache-attr-parser';
import { awaitUntilAbort } from '../../../aura-utils/async/await-until-abort';
import { runConcurrent } from '../../../aura-utils/async/run-concurrent';
import { type DocumentHeadValues } from '../document';
import { ENGINE_DEFAULTS } from '../aura-routing-engine-config';
import type { LoadHookMode } from '../data-graph';
import { createViewLoadError } from '../failure';
import { invalidateRouterCache } from '../invalidate-router-cache';
import type { RouterInvalidateOptions } from '../invalidate-router-cache';
import { viewKey, viewKeyWithData } from '../match/resource-keys';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import type { PipelineStepResult } from '../navigation/types';
import { HandoffCache } from '../resource-graph/handoff-cache';
import type { HandoffWaiter } from '../resource-graph/handoff-work-registry';
import type { ResolvedView } from '../route-tree/resolved-view';

import { defaultLoaderRegistry } from './registry';
import type { LoaderRegistry } from './registry';
import type { ViewDescriptor, ViewLoadContext, ViewPayload, ViewSnapshotEntry } from './types';

type TerminalOutcome = Exclude<PipelineStepResult, null>;

/** Long `cache.view` entry: string payload + document head (same invalidate / gc lifecycle). */
type ViewCacheEntry = {
  payload: string;
  head: DocumentHeadValues | undefined;
};

/** Options for the long-lived `cache.view` store. */
export type ViewGraphCacheOptions = Pick<SwrCacheOptions<ViewCacheEntry>, 'max' | 'staleTime' | 'gcTime'>;

export type ViewGraphDeps = {
  /** Defaults to {@link defaultLoaderRegistry}. */
  readonly registry?: LoaderRegistry;
  /** Merged over {@link ViewGraph.configure} defaults for the internal payload cache. */
  readonly cache?: ViewGraphCacheOptions;
};

/** Static view data, or a per-route resolver (e.g. data-bound content in {@link ViewGraph.load}). */
export type ViewDataInput = unknown | ((match: MatchedRouteInfo) => unknown);

export type ViewLoadOptions = {
  readonly data?: ViewDataInput;
  /** Defaults to `navigation`. Prefetch paths pass `prefetch`. */
  readonly mode?: LoadHookMode;
  /**
   * When set, loader failures go through {@link NavigationTransaction.fail}.
   * Tests / {@link ViewResolverPort} may omit it — then errors throw
   * (unlike {@link DataGraph}, where `transaction` is always required).
   */
  readonly transaction?: NavigationTransaction;
  /** Prefetch only — parallel cap. Default: `3`. */
  readonly concurrency?: number;
  /** Prefetch only — `root-first` matches enter-branch mount order. Default: `root-first`. */
  readonly order?: 'leaf-first' | 'root-first';
};

/**
 * `{ payload, head }` ok · `{ error }` navigation stop · `{}` soft skip (no descriptor / prefetch).
 * Success fields match {@link ViewSnapshotEntry}. `{ error }` / `{}` match DataGraph; DataGraph success is `{ data }`.
 */
export type ViewGraphLoadResult = {
  payload?: ViewPayload | null;
  /** Always present on success; `undefined` when the loader did not extract a document head. */
  head?: DocumentHeadValues;
  error?: TerminalOutcome;
};

/**
 * Batch {@link ViewGraph.load}: `{ data }` ok · `{ error }` first failure · `{}` empty.
 * `mode: 'navigation'` drops partial sibling results on error (same as {@link DataGraph.load}).
 * `mode: 'prefetch'` returns `{}` after warmup (soft; never fails the caller).
 */
export type ViewGraphLoadViewsResult = {
  data?: ViewGraphLoadResult[];
  error?: TerminalOutcome;
};

/** Prefetch scheduling fields on {@link ViewLoadOptions}. */
export type ViewPrefetchOptions = Pick<ViewLoadOptions, 'concurrency' | 'order'>;

/** Soft skip — prefetch cancel / no descriptor. */
const SKIP_RESULT: ViewGraphLoadResult = {};
/** Navigation interest dropped before settle. */
const CANCELLED_RESULT: ViewGraphLoadResult = { error: { status: 'cancelled' } };

/** Route fields read when building a {@link ViewDescriptor} from {@link MatchedRouteInfo}. */
export type RouteViewSource = {
  readonly layout: string;
  readonly cache: CacheFlags;
  readonly extract?: string | null;
};

/**
 * View payload coordinator: descriptor → loader → cache → {@link ViewPayload}.
 * Owned by {@link ResourceGraph} (one per engine): render, branch-resolve, prefetch.
 *
 * Shared prepare: {@link HandoffCache.hold} → loader/`workSignal`; interest →
 * {@link awaitUntilAbort}; `finally` → release.
 * Handoff value for view keys is `{ payload, head }` (head survives prefetch joins).
 * Long revisit: string payloads with `cache.view` stay in {@link AuraResolvableSwrCache}
 * as {@link ViewCacheEntry} (`DocumentFragment` is never long-cached — mount empties it).
 */
export class ViewGraph {
  private static defaultCacheOptions: ViewGraphCacheOptions = {};

  private readonly registry: LoaderRegistry;
  private readonly cache: AuraResolvableSwrCache<ViewCacheEntry>;
  private readonly sharedBuffer: HandoffCache;

  /** Default `cache.view` options for engine-created graphs. */
  static configure(options: ViewGraphCacheOptions = {}): void {
    ViewGraph.defaultCacheOptions = { ...ViewGraph.defaultCacheOptions, ...options };
  }

  constructor(sharedBuffer: HandoffCache, deps: ViewGraphDeps = {}) {
    this.registry = deps.registry ?? defaultLoaderRegistry;
    this.sharedBuffer = sharedBuffer;
    this.cache = new AuraResolvableSwrCache({
      ...ENGINE_DEFAULTS.viewCache,
      ...ViewGraph.defaultCacheOptions,
      ...deps.cache,
      gcSweepInterval: false,
    });
  }

  /**
   * Batch enter-route view loads. Routes by {@link ViewLoadOptions.mode}:
   * - `navigation` (default) — parallel {@link loadView}; first `{ error }` wins, partial data dropped
   * - `prefetch` — bounded concurrency / order; soft warmup, returns `{}`
   *
   * Per-route data: pass `options.data` as `(match) => …`.
   */
  async load(
    matches: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options?: ViewLoadOptions,
  ): Promise<ViewGraphLoadViewsResult> {
    if (!matches.length) return {};

    if (options?.mode === 'prefetch') {
      await this.loadPrefetch(matches, signal, options);
      return {};
    }

    return this.loadNavigation(matches, signal, options);
  }

  /** Navigation batch: unbounded parallel {@link loadView}. */
  private async loadNavigation(
    matches: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options?: ViewLoadOptions,
  ): Promise<ViewGraphLoadViewsResult> {
    const results = await Promise.all(
      matches.map((match) => this.loadView(match, signal, options)),
    );
    const error = results.find((result) => result.error)?.error;
    return error ? { error } : { data: results };
  }

  /** Prefetch batch: bounded concurrency + order; swallows per-route failures. */
  private loadPrefetch(
    matches: readonly MatchedRouteInfo[],
    signal: AbortSignal,
    options?: ViewLoadOptions,
  ): Promise<void> {
    const concurrency = options?.concurrency ?? 3;
    const order = options?.order ?? 'root-first';
    const ordered = order === 'leaf-first' ? [...matches].reverse() : matches;
    return runConcurrent(
      ordered,
      concurrency,
      (match) => this.loadView(match, signal, { ...options, mode: 'prefetch' }),
      signal,
    );
  }

  /**
   * Load payload for a matched route (`layout` wins over resolved `view` attr).
   * Single-route entry ({@link ViewResolverPort}). Outcome: `{ payload, head }` / `{ error }` / `{}`.
   */
  loadView(
    match: MatchedRouteInfo,
    signal: AbortSignal,
    options?: ViewLoadOptions,
  ): Promise<ViewGraphLoadResult> {
    const descriptor = buildViewDescriptor(
      match.route as RouteViewSource,
      match.resolvedView,
    );
    if (!descriptor) return Promise.resolve(SKIP_RESULT);

    return this.loadPayload(descriptor, match, signal, options);
  }

  /** Direct resolve bypassing route attrs — tests and explicit descriptor loads. */
  async loadPayload(
    descriptor: ViewDescriptor,
    match: MatchedRouteInfo,
    interestSignal: AbortSignal,
    options?: ViewLoadOptions,
  ): Promise<ViewGraphLoadResult> {
    const mode = options?.mode ?? 'navigation';
    const transaction = options?.transaction;
    const data = resolveViewData(match, options?.data);

    if (interestSignal.aborted) return cancelledResult(mode);

    const key = resolveViewCacheKey(match, data);
    if (!key) return {};

    const useLongCache = descriptor.cache;

    // Warm long cache → no hold, no handoff.
    const hit = this.readLongCacheHit(useLongCache, key, interestSignal, mode, transaction);
    if (hit) return hit;

    const waiter = this.sharedBuffer.hold(key, mode);

    try {
      const shared = this.runSharedLoad(key, useLongCache, () =>
        this.runViewLoader(descriptor, match, waiter.workSignal, data),
      );
      // Interest may detach before settle; don't leave an unhandled rejection on shared.
      void shared.catch(() => {
      });
      const handoff = await awaitUntilAbort(shared, interestSignal);

      if (!isInterestActive(interestSignal, transaction)) return cancelledResult(mode);

      return handoff;
    } catch (error) {
      return this.toLoadErrorResult(error, match, interestSignal, mode, transaction);
    } finally {
      waiter.release();
    }
  }

  /**
   * Read-only probe: long payload entry exists for `match.viewKey`.
   * No LRU promote, no checkout. Caller decides policy (`cache.view`, layout, …).
   *
   * Used by {@link ../route-tree/can-use-fast-path!canUseViewCacheFastPath}.
   */
  hasCachedView(match: MatchedRouteInfo): boolean {
    const key = resolveViewCacheKey(match);
    if (!key) return false;
    return this.cache.has(key);
  }

  /**
   * Document head colocated with a warm `cache.view` entry (same key as {@link hasCachedView}).
   * Used when prepare skipped loads (view-cache fast path / update) but commit still needs head.
   */
  getCachedHtmlHead(match: MatchedRouteInfo): DocumentHeadValues | undefined {
    const key = resolveViewCacheKey(match);
    if (!key) return undefined;
    return this.cache.get(key)?.head;
  }

  /**
   * Invalidate long `cache.view` entries ({@link RouterInvalidateOptions}, default policy `stale`).
   * Clears the shared prepare handoff buffer so the next load/prefetch cannot reuse stale settles.
   * Document head is part of each entry — invalidated with the payload.
   */
  invalidate(options: RouterInvalidateOptions = {}): number {
    const count = invalidateRouterCache(this.cache, options, 'stale');
    this.sharedBuffer.clear();
    return count;
  }

  destroy(): void {
    this.cache.destroy();
  }

  /** Hit on `cache.view` without touching handoff; `undefined` → miss. */
  private readLongCacheHit(
    useLongCache: boolean,
    key: string,
    interestSignal: AbortSignal,
    mode: LoadHookMode,
    transaction: NavigationTransaction | undefined,
  ): ViewGraphLoadResult | undefined {
    if (!useLongCache) return undefined;

    const entry = this.cache.get(key);
    if (entry === undefined) return undefined;

    if (!isInterestActive(interestSignal, transaction)) return cancelledResult(mode);
    return entry;
  }

  /**
   * Handoff (+ optional long `cache.view` rebuild into handoff value).
   * Factory uses the waiter {@link HandoffWaiter.workSignal}, not caller interest.
   */
  private runSharedLoad(
    key: string,
    useLongCache: boolean,
    load: () => Promise<ViewSnapshotEntry>,
  ): Promise<ViewSnapshotEntry> {
    return this.sharedBuffer.resolve(key, async () => {
      if (useLongCache) {
        const entry = this.cache.get(key);
        if (entry !== undefined) return entry;
      }

      return load();
    }) as Promise<ViewSnapshotEntry>;
  }

  /**
   * Run the view loader against `workSignal` (shared {@link HandoffWaiter.workSignal}).
   * Abort must **reject** — never settle `null` into handoff (that would poison the TTL window).
   */
  private async runViewLoader(
    descriptor: ViewDescriptor,
    match: MatchedRouteInfo,
    workSignal: AbortSignal,
    data?: unknown,
  ): Promise<ViewSnapshotEntry> {
    throwIfAborted(workSignal);

    try {
      const result = await this.registry.get(descriptor.loader).load(
        buildLoadContext(match, descriptor, workSignal, data),
      );
      const payload = result?.value ?? null;
      const head = result?.kind === 'html' ? result.head : undefined;

      if (descriptor.cache && typeof payload === 'string') {
        const key = resolveViewCacheKey(match, data);
        if (key) {
          this.cache.set(
            key,
            { payload, head },
            {
              gcTime: match.route.cacheTime ?? undefined,
              staleTime: match.route.cacheRefresh ?? undefined,
            },
          );
        }
      }

      return { payload, head };
    } catch (error: unknown) {
      throwIfAborted(workSignal);
      throw createViewLoadError(descriptor.loader, match.pattern, error);
    }
  }

  private async toLoadErrorResult(
    error: unknown,
    match: MatchedRouteInfo,
    interestSignal: AbortSignal,
    mode: LoadHookMode,
    transaction: NavigationTransaction | undefined,
  ): Promise<ViewGraphLoadResult> {
    if (mode === 'prefetch') return SKIP_RESULT;
    if (!isInterestActive(interestSignal, transaction)) return CANCELLED_RESULT;
    if (transaction) {
      return { error: await transaction.fail(match, error, 'render') };
    }
    throw error;
  }
}

function buildViewDescriptor(
  route: RouteViewSource,
  resolvedView: ResolvedView | null | undefined,
): ViewDescriptor | null {
  const layout = route.layout.trim();
  if (layout) return { kind: 'layout', loader: 'template', content: layout, cache: false };
  if (!resolvedView?.loader) return null;

  const descriptor: ViewDescriptor = {
    kind: 'view',
    loader: resolvedView.loader,
    content: resolvedView.content,
    cache: route.cache.view,
  };
  return resolvedView.loader === 'url' && route.extract
    ? { ...descriptor, extract: route.extract }
    : descriptor;
}

function resolveViewData(match: MatchedRouteInfo, data: ViewDataInput | undefined): unknown {
  return typeof data === 'function' ? data(match) : data;
}

/** Prefer precomputed `match.viewKey`; fall back for hand-built matches. */
function resolveViewCacheKey(match: MatchedRouteInfo, data?: unknown): string | null {
  const base = match.viewKey ?? viewKey(match);
  if (!base) return null;
  return data !== undefined ? viewKeyWithData(base, data) : base;
}

function cancelledResult(mode: LoadHookMode): ViewGraphLoadResult {
  return mode === 'prefetch' ? SKIP_RESULT : CANCELLED_RESULT;
}

function isInterestActive(
  interestSignal: AbortSignal,
  transaction?: NavigationTransaction,
): boolean {
  return !interestSignal.aborted && (transaction == null || transaction.isActive());
}

function buildLoadContext(
  match: MatchedRouteInfo,
  descriptor: Pick<ViewDescriptor, 'kind' | 'content' | 'extract'>,
  workSignal: AbortSignal,
  data?: unknown,
): ViewLoadContext {
  return {
    content: descriptor.content,
    kind: descriptor.kind,
    signal: workSignal,
    route: {
      href: match.href,
      pattern: match.pattern,
      ...(match.params && { params: match.params }),
      ...(match.query && { query: match.query }),
    },
    ...(data !== undefined && { data }),
    ...(descriptor.extract && { extract: descriptor.extract }),
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Aborted', 'AbortError');
}

import type { DataGraphCacheOptions } from './data-graph';
import type { NavigationFailure, NavigationHookErrorDetail } from './failure';
import type { NavigationProvider } from './history/provider.types';
import type { MatchedRouteInfo } from './match/url-matcher';
import type { PrefetchConfig } from './prefetch/types';
import type { HandoffCacheOptions } from './resource-graph/handoff-cache';
import type { LoaderRegistry, ViewGraph, ViewGraphCacheOptions } from './view-graph';

/**
 * Production defaults for {@link AuraRoutingEngineConfig}.
 * One object — read top-to-bottom (chrome → caches → prefetch).
 */
export const ENGINE_DEFAULTS = {
  linksSelector: '[aura-router-link]',
  hash: false,

  /** `cache.view` — max entries, GC after 12h. */
  viewCache: {
    max: 50,
    gcTime: 43_200_000,
  } satisfies ViewGraphCacheOptions,

  /** `cache.data` — SWR fresh 30s, GC after 5min. */
  dataCache: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  } satisfies DataGraphCacheOptions,

  /** Prepare handoff TTL (prefetch → navigation). */
  sharedBufferOptions: {
    ttl: 30_000,
  } satisfies HandoffCacheOptions,

  /** Link prefetch; pass `prefetch: false` on the engine to disable. */
  prefetch: {
    defaultMode: 'intent',
    intentDelayMs: 50,
    viewportDelayMs: 0,
    tapDelayMs: 0,
    staleTimeMs: 30_000,
    maxAgeMs: 30_000,
  } satisfies PrefetchConfig,
} as const;

export interface AuraRoutingEngineConfig {
  /** Default: `'[aura-router-link]'`. */
  linksSelector?: string;
  /** Default: `false`. */
  hash?: boolean;
  /** Default: BrowserHistoryProvider. */
  provider?: NavigationProvider;

  /** Advanced tests — prefer `viewRegistry`. Must share handoff with data. */
  viewGraph?: ViewGraph;
  viewRegistry?: LoaderRegistry;
  /** Merged in ViewGraph: ENGINE_DEFAULTS.viewCache → configure() → this. */
  viewCache?: ViewGraphCacheOptions;
  /** Merged in DataGraph: ENGINE_DEFAULTS.dataCache → configure() → this. */
  dataCache?: DataGraphCacheOptions;
  /** Default: `{ ttl: 30_000 }`. */
  sharedBufferOptions?: HandoffCacheOptions;

  /** Default: ENGINE_DEFAULTS.prefetch; `false` disables. */
  prefetch?: false | PrefetchConfig;

  onHashOnlyNavigation?: (href: string) => void;
  /**
   * Same pathname+search again (`push` / `replace`, pipeline `noop`).
   * Not the same as same-route-record updates (`/users/1` → `/users/2`).
   * Host typically reasserts scroll (top / scroll-target). Hash re-clicks are handled in-engine.
   */
  onSameUrlNavigation?: (to: MatchedRouteInfo) => void;
  onNavigationHookError?: (detail: NavigationHookErrorDetail) => void;
  /** Fallback NOT_FOUND — host owns event + recovery UI. */
  onNotFound?: (failure: NavigationFailure) => void;
}

export type ResolvedAuraRoutingEngineConfig = AuraRoutingEngineConfig & {
  linksSelector: string;
  hash: boolean;
  sharedBufferOptions: HandoffCacheOptions;
  prefetch: false | PrefetchConfig;
};

/** Apply {@link ENGINE_DEFAULTS} under user overrides. */
export function resolveAuraRoutingEngineConfig(
  config: AuraRoutingEngineConfig = {},
): ResolvedAuraRoutingEngineConfig {
  return {
    ...config,
    linksSelector: config.linksSelector ?? ENGINE_DEFAULTS.linksSelector,
    hash: config.hash ?? ENGINE_DEFAULTS.hash,
    sharedBufferOptions: {
      ...ENGINE_DEFAULTS.sharedBufferOptions,
      ...config.sharedBufferOptions,
    },
    prefetch:
      config.prefetch === false
        ? false
        : { ...ENGINE_DEFAULTS.prefetch, ...config.prefetch },
  };
}

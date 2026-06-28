import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteNode } from '../route-tree/route-node.types';

export type PrefetchMode = 'intent' | 'viewport' | 'tap' | 'render' | 'manual' | 'none';

/** Resolved match + branch for prefetch executors. */
export type PrefetchPlan = {
  readonly href: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly leaf: MatchedRouteInfo;
  readonly chain: readonly MatchedRouteInfo[];
  readonly registryGeneration: number;
};

export type PrefetchRunContext = {
  readonly signal: AbortSignal;
  readonly mode: PrefetchMode;
};

export type PrefetchOptions = {
  readonly mode?: PrefetchMode;
  readonly signal?: AbortSignal;
  readonly force?: boolean;
};

export interface PrefetchExecutor {
  readonly id: string;
  run(plan: PrefetchPlan, ctx: PrefetchRunContext): Promise<void>;
}

export interface SpeculationPrefetchPort {
  hint(plan: PrefetchPlan, ctx: PrefetchRunContext): void;
}

export type PrefetchConfig = {
  readonly defaultMode?: PrefetchMode;
  readonly intentDelayMs?: number;
  readonly viewportDelayMs?: number;
  readonly tapDelayMs?: number;
  readonly staleTimeMs?: number;
  readonly maxAgeMs?: number;
  readonly currentHref?: () => string;
  readonly onStart?: (plan: PrefetchPlan, ctx: PrefetchRunContext) => void;
  readonly onComplete?: (plan: PrefetchPlan, ctx: PrefetchRunContext) => void;
  readonly onError?: (plan: PrefetchPlan, error: unknown, ctx: PrefetchRunContext) => void;
  readonly onSkipped?: (href: string, reason: PrefetchSkipReason) => void;
  readonly onIntent?: (intent: PrefetchIntent) => void;
};

export type PrefetchSkipReason =
  | 'disabled'
  | 'save-data'
  | 'invalid-href'
  | 'hash-only'
  | 'same-route-fresh'
  | 'no-match'
  | 'aborted';

export type PrefetchIntent =
  | { readonly type: 'schedule'; readonly href: string; readonly mode?: PrefetchMode; readonly source: string }
  | { readonly type: 'cancel'; readonly href?: string; readonly source?: string };

export type PrefetchPipelineDeps = {
  readonly matcher: {
    matchPath(pathname: string, nodes: readonly RouteNode[]): {
      node: RouteNode;
      params: Record<string, string>;
    } | null;
    toRouteInfo(
      href: string,
      pathname: string,
      search: string,
      hash: string,
      node: RouteNode,
      params?: Record<string, string>,
    ): MatchedRouteInfo;
  };
  readonly getMatchableNodes: () => readonly RouteNode[];
  readonly getRegistryGeneration: () => number;
  readonly executors: readonly PrefetchExecutor[];
  readonly speculation?: SpeculationPrefetchPort;
};

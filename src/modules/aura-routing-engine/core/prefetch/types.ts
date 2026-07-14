import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteNode } from '../route-tree/route-node.types';
import {
  DEFAULT_ROUTER_PREFETCH_MODE,
  LINK_PREFETCH_MODES,
  type PrefetchType,
} from '../../../aura-route/core/attr/prefetch-attr-parser';

export { DEFAULT_ROUTER_PREFETCH_MODE, LINK_PREFETCH_MODES };
export type LinkPrefetchMode = PrefetchType;
export type PrefetchMode = LinkPrefetchMode | 'none';

/** Resolved match + LCA delta for prefetch planning. */
export type PrefetchPlan = {
  readonly href: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly leaf: MatchedRouteInfo;
  readonly chain: readonly MatchedRouteInfo[];
  readonly enterRoutes: readonly MatchedRouteInfo[];
  readonly lca: MatchedRouteInfo | null;
  readonly registryGeneration: number;
};

/** Per-run pipeline context (before resource planning). */
export type PrefetchRunContext = {
  readonly signal: AbortSignal;
  readonly mode: PrefetchMode;
};

export type PrefetchOptions = {
  readonly mode?: PrefetchMode;
  readonly signal?: AbortSignal;
  readonly force?: boolean;
};

export type PrefetchResourceKind = 'view' | 'data';

export type PrefetchResourcePriority = 'low' | 'normal' | 'high';

/** Mode + confidence passed to the resource planner. */
export type PrefetchPlanContext = {
  readonly mode: PrefetchMode;
  readonly confidence: number;
};

/** Declarative work unit — planner output; PrefetchPipeline maps kinds to speculative prepare flags. */
export type PrefetchResource = {
  readonly kind: PrefetchResourceKind;
  readonly targets: readonly MatchedRouteInfo[];
  readonly priority: PrefetchResourcePriority;
};

/** Plans which resources to prefetch for a navigation target. */
export interface PrefetchResourcePlanner {
  planResources(plan: PrefetchPlan, ctx: PrefetchPlanContext): readonly PrefetchResource[];
  explainEmptyPlan?(
    plan: PrefetchPlan,
    ctx: PrefetchPlanContext,
  ): 'low-confidence' | 'no-targets';
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
  | 'no-targets'
  | 'low-confidence'
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
  readonly planner: PrefetchResourcePlanner;
  readonly speculation?: SpeculationPrefetchPort;
  readonly runSpeculativePrepare: (
    plan: PrefetchPlan,
    ctx: {
      readonly mode: PrefetchMode;
      readonly signal: AbortSignal;
      readonly data: boolean;
      readonly view: boolean;
    },
  ) => Promise<void>;
};

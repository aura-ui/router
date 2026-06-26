import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouteNode } from '../route-tree';

/** How prefetch was triggered — aligns with link `data-prefetch` and router defaults. */
export type PrefetchMode = 'intent' | 'viewport' | 'tap' | 'render' | 'manual' | 'none';

/** Resolved navigation target for prefetch executors. */
export type PrefetchTarget = {
  readonly href: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly leaf: MatchedRouteInfo;
  readonly chain: readonly MatchedRouteInfo[];
};

export type PrefetchExecContext = {
  readonly signal: AbortSignal;
  readonly mode: PrefetchMode;
  readonly reason: PrefetchMode;
};

export type PrefetchOptions = {
  readonly mode?: PrefetchMode;
  readonly reason?: PrefetchMode;
  readonly signal?: AbortSignal;
  /** Bypass stale-time skip and in-flight dedupe. */
  readonly force?: boolean;
};

/** Sibling: view content (html-src, template, components). */
export interface ContentPrefetchPort {
  prefetch(target: PrefetchTarget, ctx: PrefetchExecContext): Promise<void>;
}

/** Sibling: `load` hook data (DataGraph). */
export interface DataPrefetchPort {
  prefetch(target: PrefetchTarget, ctx: PrefetchExecContext): Promise<void>;
}

/**
 * Optional adapter for Speculation Rules / prerender hints (future web).
 * Controller calls `hint` fire-and-forget before executors run.
 */
export interface SpeculationPrefetchPort {
  hint(target: PrefetchTarget, ctx: PrefetchExecContext): void;
}

export type PrefetchConfig = {
  /** Default when mode is omitted on intent scheduling. */
  readonly defaultMode?: PrefetchMode;
  readonly intentDelayMs?: number;
  readonly viewportDelayMs?: number;
  readonly tapDelayMs?: number;
  /** Fresh window — skip repeat prefetch for the same href. */
  readonly staleTimeMs?: number;
  /** Drop bookkeeping for hrefs not revisited (GC of intent metadata). */
  readonly maxAgeMs?: number;
  readonly currentHref?: () => string;
  readonly onStart?: (target: PrefetchTarget, ctx: PrefetchExecContext) => void;
  readonly onComplete?: (target: PrefetchTarget, ctx: PrefetchExecContext) => void;
  readonly onError?: (target: PrefetchTarget, error: unknown, ctx: PrefetchExecContext) => void;
  readonly onSkipped?: (href: string, reason: PrefetchSkipReason) => void;
};

export type PrefetchSkipReason =
  | 'disabled'
  | 'save-data'
  | 'invalid-href'
  | 'hash-only'
  | 'same-route-fresh'
  | 'no-match'
  | 'aborted';

export type PrefetchControllerDeps = {
  readonly matcher: {
    matchPath(pathname: string, nodes: readonly RouteNode[]): { node: RouteNode; params: Record<string, string> } | null;
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
  readonly content?: ContentPrefetchPort;
  readonly data?: DataPrefetchPort;
  readonly speculation?: SpeculationPrefetchPort;
};

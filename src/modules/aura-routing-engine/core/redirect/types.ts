import type { ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import type { CompletedBlockingPhases, PipelineStepResult } from '../navigation/types';
import type { RouteNode } from '../route-tree/route-node.types';

/**
 * Leaf match at one redirect-resolution step.
 * Tagged union branch used by {@link NavigationMatchStep}.
 */
export type MatchedNavigationTarget = MatchedRouteInfo & {
  readonly kind: 'matched';
  /** `true` when the leaf was reached after at least one redirect hop in the chain. */
  readonly viaRedirect: boolean;
};

/**
 * Terminal redirect-chain failure: cycle or max depth exceeded.
 * Shared by sync and async redirect resolution (`status: 'redirect-error'`).
 */
export type RedirectErrorOutcome = {
  readonly status: 'redirect-error';
  readonly code: 'redirect-cycle' | 'redirect-depth-exceeded';
  readonly href: string;
};

/**
 * Outcome of {@link ./redirect-resolver!followDeclarativeRedirects}.
 * Sync resolution over declarative `redirect` attrs only (no hooks).
 */
export type DeclarativeRedirectOutcome =
  | { readonly status: 'resolved'; readonly target: MatchedNavigationTarget }
  | { readonly status: 'unmatched' }
  | RedirectErrorOutcome;

/**
 * Outcome of {@link ./redirect-resolver!followRedirectsWithBlockingPhases}.
 * Pre-commit resolution: declarative redirects + blocking hooks, no render.
 */
export type RedirectResolveResult =
  | {
      readonly status: 'resolved';
      readonly target: MatchedNavigationTarget;
      /** When `true`, coordinator should commit via `history.replaceState`. */
      readonly replace: boolean;
      /** Marker that blocking probe ran; any value (even `{}`) skips leave/guard/load in full pipeline. */
      readonly completedBlockingPhases: CompletedBlockingPhases;
    }
  | { readonly status: 'unmatched' }
  | RedirectErrorOutcome
  | {
      readonly status: 'terminal';
      readonly result: Exclude<PipelineStepResult, null>;
      readonly probe: NavigationTransaction;
    };

/**
 * Mutable state while walking a redirect chain.
 * `originalUrlParts.search` / `hash` are preserved on every hop; redirect targets are path-only.
 */
export type RedirectionContext = {
  readonly originalUrlParts: ResolvedDocumentHref;
  /** Current href in the chain (updated on each redirect hop). */
  stepHref: string;
  /** Normalized pathname keys for cycle detection (`/a` and `/a/` share one key). */
  readonly visitedPathnames: Set<string>;
  /** `true` after at least one redirect hop in this chain. */
  viaRedirect: boolean;
  /** Initial `options.replace` plus hook-redirect `replace` / `pop` accumulation. */
  historyReplace: boolean;
};

/**
 * Dependencies injected into {@link ./redirect-resolver!followRedirectsWithBlockingPhases}.
 */
export type RedirectResolverContext = {
  readonly engine: AuraRoutingEngine;
  readonly matcher: RedirectMatcher;
  readonly getMatchableNodes: () => readonly RouteNode[];
  /** `true` while the navigation attempt is still current; `false` after supersede. */
  readonly isActive: () => boolean;
};

/** Matcher surface required for redirect resolution and prefetch lookup. */
export type RedirectMatcher = Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;

/** Input for {@link ./redirect-resolver!followRedirectsWithBlockingPhases}. */
export type RedirectChainInput = {
  readonly href: string | ResolvedDocumentHref;
  readonly from: MatchedRouteInfo | null;
  readonly action: HistoryAction;
  readonly options: NavigateHistoryOptions;
};

/**
 * Internal outcome of a blocking-phases probe on one candidate leaf.
 * `done: false` — hook returned redirect; `done: true` + `terminal` — cancel/error; else `resolved`.
 */
export type BlockingPhasesProbeOutcome =
  | { readonly done: true; readonly result: RedirectResolveResult }
  | { readonly done: false; readonly href: string };

/**
 * One step of redirect resolution for a single href:
 * leaf match, declarative redirect hop, or no match (`null`).
 */
export type NavigationMatchStep =
  | MatchedNavigationTarget
  | { readonly kind: 'redirect'; readonly href: string };

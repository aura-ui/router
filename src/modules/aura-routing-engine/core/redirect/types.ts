import type { ResolvedDocumentHref } from '../../../aura-utils/misc/url';
import type { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import type { NavigationTransaction } from '../navigation/navigation-transaction';
import type { CompletedBlockingPhases, PipelineStepResult } from '../navigation/types';
import type { RouteNode } from '../route-tree/route-node.types';

/** Leaf match at one redirect-resolution step (internal match-step union tag). */
export type MatchedNavigationTarget = MatchedRouteInfo & {
  readonly kind: 'matched';
  readonly viaRedirect: boolean;
};

/** Redirect chain failure (cycle or depth). */
export type RedirectErrorOutcome = {
  readonly status: 'redirect-error';
  readonly code: 'redirect-cycle' | 'redirect-depth-exceeded';
  readonly href: string;
};

/** Result of sync declarative redirect resolution (prefetch, diagnostics). */
export type DeclarativeRedirectOutcome =
  | { readonly status: 'resolved'; readonly target: MatchedNavigationTarget }
  | { readonly status: 'unmatched' }
  | RedirectErrorOutcome;

/** Result of pre-commit redirect resolution with blocking phases. */
export type RedirectResolveResult =
  | {
      readonly status: 'resolved';
      readonly target: MatchedNavigationTarget;
      readonly replace: boolean;
      readonly completedBlockingPhases: CompletedBlockingPhases;
    }
  | { readonly status: 'unmatched' }
  | RedirectErrorOutcome
  | {
      readonly status: 'terminal';
      readonly result: Exclude<PipelineStepResult, null>;
      readonly probe: NavigationTransaction;
    };

/** Mutable state while walking a redirect chain. */
export type RedirectionContext = {
  readonly originalUrlParts: ResolvedDocumentHref;
  stepHref: string;
  readonly visitedPathnames: Set<string>;
  viaRedirect: boolean;
  historyReplace: boolean;
};

/** Dependencies injected into {@link followRedirectsWithBlockingPhases}. */
export type RedirectResolverContext = {
  readonly engine: AuraRoutingEngine;
  readonly matcher: RedirectMatcher;
  readonly getMatchableNodes: () => readonly RouteNode[];
  readonly isActive: () => boolean;
};

export type RedirectMatcher = Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;

/** Input for {@link followRedirectsWithBlockingPhases}. */
export type RedirectChainInput = {
  readonly href: string | ResolvedDocumentHref;
  readonly from: MatchedRouteInfo | null;
  readonly action: HistoryAction;
  readonly options: NavigateHistoryOptions;
};

/** Outcome of {@link runTransactionBlockingPhases} inside redirect resolution. */
export type BlockingPhasesProbeOutcome =
  | { readonly done: true; readonly result: RedirectResolveResult }
  | { readonly done: false; readonly href: string };

/** One redirection step: leaf match or declarative redirect. */
export type NavigationMatchStep =
  | MatchedNavigationTarget
  | { readonly kind: 'redirect'; readonly href: string };

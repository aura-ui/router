import type { AuraRoutingEngine } from '../aura-routing-engine';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { AuraRoutingUrlMatcher, MatchedRouteInfo } from '../match/url-matcher';
import type { RouteNode } from '../route-tree/route-node.types';
import type { NavigationTransaction } from './navigation-transaction';
import type { PipelineStepResult, TransactionResult } from './types';

/**
 * Narrow engine surface for {@link NavigationCoordinator}.
 * Keeps orchestration in the coordinator; state commits and finalize stay on the engine.
 */
export interface NavigationHost {
  readonly isRunning: boolean;
  /** Probe transactions and the full pipeline require the engine instance. */
  readonly engine: AuraRoutingEngine;
  readonly matcher: Pick<AuraRoutingUrlMatcher, 'matchPath' | 'toRouteInfo'>;

  getCommittedRoute(): MatchedRouteInfo | null;
  getMatchableNodes(): readonly RouteNode[];

  /** Pop/system URL sync when redirect resolution normalizes trailing slashes. */
  commitPopSlashFix(href: string): void;

  /** Guard/load short-circuit during pre-commit redirect resolution. */
  finalizeResolveTerminal(
    result: Exclude<PipelineStepResult, null>,
    probe: NavigationTransaction,
  ): void;

  handleUnmatchedNavigation(
    requestedHref: string,
    action: HistoryAction,
    options: NavigateHistoryOptions,
  ): void;

  finalizeCancelled(transaction: NavigationTransaction): void;

  applyRedirect(
    result: Extract<TransactionResult, { status: 'redirect' }>,
    transaction: NavigationTransaction,
  ): void;

  finalizeError(
    result: Extract<TransactionResult, { status: 'error' }>,
    transaction: NavigationTransaction,
  ): void;
}

/**
 * Navigation types — transaction outcomes, pipeline policy, phase definitions,
 * and per-transaction orchestration context.
 *
 * Route lifecycle phase vocabulary: {@link ../route/types}.
 *
 * @module navigation/types
 */

import type { DataSnapshot } from '../data-graph';
import type { FailedNavigation, ReportNavigationHookError } from '../failure';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { HookRegistry } from '../hooks/registry';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type {
  LifecyclePhase,
  RouteHookAttrProp,
  RouteInstance,
  RouteLifecycleContext,
  RoutePhase,
  RouterInstance,
} from '../route/types';
import type { TransitionMap } from '../route-tree/transition-plan';
import type { ViewCommitTracker } from '../view-mount/view-commit-tracker';

// --- Transaction outcomes ---

/** Terminal pipeline outcome: navigation failed with a structured failure object. */
export type NavigationErrorResult = { status: 'error'; failure: FailedNavigation };

/**
 * Terminal navigation outcome (history policy, engine finalization).
 *
 * `status: 'navigationSucceeded'` — full pipeline succeeded (not the same as
 * view `committed` or {@link FailedNavigation.viewCommitted}).
 * History URL commit is done by the engine after success.
 */
export type TransactionResult =
  | { status: 'navigationSucceeded' }
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | NavigationErrorResult;

/** Pipeline step outcome: terminal {@link TransactionResult} or `null` to continue. */
export type TransactionFullResult = TransactionResult | null;

// --- Coordinator ---

export interface NavigationTransactionOptions {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  href: string;
  hash: string;
  options: NavigateHistoryOptions;
}

// --- Pipeline policy ---

/** Branch in transition plan: exiting vs entering routes. */
export type LifecycleBranch = 'exitRoutes' | 'enterRoutes';

/** Post-commit hook error policy (see {@link LifecycleHookHandling}). */
export type PostCommitHookErrors = 'propagate' | 'log';

/**
 * When registered hooks run relative to view commit.
 *
 * - `blocking` — before view commit; cancel/redirect stops navigation
 * - `postCommit` — after view commit; cancel/redirect are ignored (warned).
 *   `onError`: `propagate` throws, `log` catches and logs.
 */
export type LifecycleHookHandling =
  | { kind: 'blocking' }
  | { kind: 'postCommit'; onError: PostCommitHookErrors };

/**
 * Route callback / hook throw policy.
 *
 * - `failure` — terminal navigation error
 * - `log` — log and continue (post-commit cleanup)
 * - `propagate` — rethrow (programmer error surface)
 */
export type PhaseThrowPolicy = 'failure' | 'log' | 'propagate';

// --- Phase registry ---

export interface RoutePhaseDefinition {
  phase: RoutePhase;
  targetRoutes: LifecycleBranch;
  hookPolicy: LifecycleHookHandling;
  errorPolicy: PhaseThrowPolicy;
  htmlAttr?: string;
  routeHookProp?: RouteHookAttrProp;
  runRouteLifecycle?: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

/** Pipeline phase — {@link RoutePhaseDefinition} with a route lifecycle callback. */
export type PipelinePhaseDefinition = RoutePhaseDefinition & {
  phase: LifecyclePhase;
  runRouteLifecycle: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
};

// --- Phase step outcomes ---

/** Terminal outcome of one blocking hook step (cancel / redirect) or continue. */
export type PhaseStepOutcome =
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | null;

/** Structured failure handed back to the pipeline (see {@link PhaseThrowPolicy `'failure'`}). */
export type PhaseError = {
  kind: 'error';
  error: unknown;
  route: MatchedRouteInfo;
  failedPhase: LifecyclePhase;
};

/**
 * Outcome of one route × phase step.
 * - `null` — continue the pipeline
 * - {@link PhaseStepOutcome} — terminal (cancel / redirect) for blocking phases
 * - {@link PhaseError} — route-level failure for the pipeline to handle
 */
export type PhaseRunResult = PhaseStepOutcome | PhaseError | null;

export type PhaseContextSource = {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
  transactionId: number;
  transactionSignal: AbortSignal;
  data?: unknown;
  error?: unknown;
};

// --- Transaction context ---

export interface LifecycleTransactionContext {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  plan: TransitionMap;
}

/** Engine orchestration context for one navigation transaction. */
export interface LifecycleRuntimeContext {
  transaction: LifecycleTransactionContext;
  transactionId: number;
  transactionSignal: AbortSignal;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  viewCommitTracker: ViewCommitTracker;
  reportHookError?: ReportNavigationHookError;
  isJobActive: () => boolean;
  dataSnapshot?: DataSnapshot;
}

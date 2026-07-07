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

// --- Shared outcomes ---

/**
 * Early exit without a structured {@link FailedNavigation}.
 * Shared by per-route blocking hooks and terminal transaction results.
 */
export type NavigationShortCircuit =
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean };

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
  | NavigationShortCircuit
  | NavigationErrorResult;

/** Pipeline step return: terminal {@link TransactionResult}, or `null` to run the next step. */
export type PipelineStepResult = TransactionResult | null;

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

/** Branch key on {@link TransitionMap}: exiting vs entering routes. */
export type TransitionBranch = 'exitRoutes' | 'enterRoutes';

/** Post-commit hook throw policy (see {@link PhaseHookTiming}). */
export type PostCommitHookErrorPolicy = 'propagate' | 'log';

/**
 * When registered hooks run relative to view commit.
 *
 * - `blocking` — before view commit; cancel/redirect stops navigation
 * - `postCommit` — after view commit; cancel/redirect are ignored (warned).
 *   `onError`: `propagate` throws, `log` catches and logs.
 */
export type PhaseHookTiming =
  | { kind: 'blocking' }
  | { kind: 'postCommit'; onError: PostCommitHookErrorPolicy };

/**
 * Policy when a route lifecycle callback or hook throws.
 *
 * - `failure` — hand off as {@link RoutePhaseFailure} for pipeline error handling
 * - `log` — log and continue (post-commit cleanup)
 * - `propagate` — rethrow (programmer error surface)
 */
export type RoutePhaseThrowPolicy = 'failure' | 'log' | 'propagate';

// --- Phase registry ---

export interface RoutePhaseDefinition {
  phase: RoutePhase;
  targetRoutes: TransitionBranch;
  hookPolicy: PhaseHookTiming;
  errorPolicy: RoutePhaseThrowPolicy;
  htmlAttr?: string;
  routeHookProp?: RouteHookAttrProp;
  runRouteLifecycle?: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

/** Pipeline phase — {@link RoutePhaseDefinition} with a route lifecycle callback. */
export type PipelinePhaseDefinition = RoutePhaseDefinition & {
  phase: LifecyclePhase;
  runRouteLifecycle: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
};

// --- Per-route phase step outcomes ---

/** Blocking hook step: {@link NavigationShortCircuit} or continue (`null`). */
export type BlockingHookStepResult = NavigationShortCircuit | null;

/**
 * Unhandled throw from a route lifecycle callback or hook (`errorPolicy: 'failure'`).
 * Converted to {@link NavigationErrorResult} by the pipeline via {@link NavigationTransaction.fail}.
 */
export type RoutePhaseFailure = {
  status: 'phaseFailed';
  error: unknown;
  route: MatchedRouteInfo;
  phase: LifecyclePhase;
};

/**
 * Outcome of one route × phase step.
 * - `null` — continue the pipeline
 * - {@link NavigationShortCircuit} — blocking hook short-circuit
 * - {@link RoutePhaseFailure} — route-level failure for the pipeline to handle
 */
export type RoutePhaseRunResult = BlockingHookStepResult | RoutePhaseFailure | null;

/** Inputs for building a {@link RouteLifecycleContext} inside the pipeline. */
export type RoutePhaseContextInput = {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
  transactionId: number;
  transactionSignal: AbortSignal;
  data?: unknown;
  error?: unknown;
};

// --- Transaction context ---

/** Transition snapshot passed into route lifecycle hooks. */
export interface NavigationTransactionSlice {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  plan: TransitionMap;
}

/** Engine orchestration context for one navigation transaction. */
export interface NavigationLifecycleContext {
  transaction: NavigationTransactionSlice;
  transactionId: number;
  transactionSignal: AbortSignal;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  viewCommitTracker: ViewCommitTracker;
  reportHookError?: ReportNavigationHookError;
  isJobActive: () => boolean;
  dataSnapshot?: DataSnapshot;
}

/**
 * Navigation types — transaction outcomes, pipeline policy, phase definitions,
 * and per-transaction orchestration context.
 *
 * ## Outcome layers
 *
 * Outcomes are modeled at three levels; each layer adds scope:
 *
 * 1. {@link NavigationShortCircuit} — `cancelled` / `redirect` (no {@link FailedNavigation})
 * 2. {@link RoutePhaseRunResult} — one route × one lifecycle phase
 *    (`null` | short-circuit | {@link RoutePhaseFailure})
 * 3. {@link PipelineStepResult} — one pipeline step (`null` | terminal {@link TransactionResult})
 *
 * {@link RoutePhaseFailure} is an intermediate shape between layers 2 and 3: the pipeline
 * converts it via {@link ./navigation-transaction!NavigationTransaction.fail} into
 * {@link NavigationErrorResult}.
 *
 * {@link ./navigation-transaction!NavigationTransaction.run} always returns a terminal {@link TransactionResult}
 * (`null` from the pipeline is coalesced to `navigationSucceeded`).
 *
 * Route lifecycle phase vocabulary: {@link ../route/types}.
 * Phase registry values: {@link ./lifecycle-phases!PHASES}.
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
 * Early navigation exit without a structured {@link FailedNavigation}.
 *
 * Produced by blocking hooks ({@link ../guard.types!GuardResult} →
 * {@link ./navigation-transaction-pipeline-phase!NavigationTransactionPipelinePhase.resolveBlockingHookOutcome})
 * and propagated unchanged up to {@link TransactionResult}.
 */
export type NavigationShortCircuit =
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean };

// --- Transaction outcomes ---

/**
 * Terminal navigation error — structured {@link FailedNavigation} for history
 * policy and engine finalization ({@link ../aura-routing-engine!AuraRoutingEngine.finalizeError}).
 */
export type NavigationErrorResult = { status: 'error'; failure: FailedNavigation };

/**
 * Terminal navigation outcome returned by {@link ./navigation-transaction!NavigationTransaction.run}.
 *
 * Dispatched by {@link ./navigation-coordinator!NavigationCoordinator} to engine
 * finalizers; history side-effects applied via {@link ./navigation-finalize!applyTransactionHistory}.
 *
 * - `navigationSucceeded` — full pipeline completed (not the same as view `committed`
 *   or {@link FailedNavigation.viewCommitted}); history URL commit is done by the engine
 * - {@link NavigationShortCircuit} — guard/load hook or abort stopped navigation
 * - {@link NavigationErrorResult} — normalized failure after {@link ./navigation-transaction!NavigationTransaction.fail}
 */
export type TransactionResult =
  | { status: 'navigationSucceeded' }
  | NavigationShortCircuit
  | NavigationErrorResult;

/**
 * Return type of a single {@link ./navigation-transaction-pipeline!NavigationTransactionPipeline}
 * step.
 *
 * - `null` — step succeeded; run the next step
 * - non-`null` — terminal {@link TransactionResult} for this navigation
 *
 * Top-level pipeline entry points ({@link ./navigation-transaction-pipeline!NavigationTransactionPipeline.runFullPipeline},
 * `runFastPipeline`, `runUpdate`) coalesce trailing `null` to `{ status: 'navigationSucceeded' }`.
 */
export type PipelineStepResult = TransactionResult | null;

// --- Coordinator ---

/** Input for starting one navigation transaction via {@link ./navigation-coordinator!NavigationCoordinator.run}. */
export interface NavigationTransactionOptions {
  /** Currently committed route, or `null` on first navigation. */
  from: MatchedRouteInfo | null;
  /** Matched target route. */
  to: MatchedRouteInfo;
  /** History action that triggered this navigation. */
  action: HistoryAction;
  /** Resolved target href written to history on success. */
  href: string;
  /** URL hash fragment for scroll restoration. */
  hash: string;
  /** Provider-specific history options (scroll, state, etc.). */
  options: NavigateHistoryOptions;
  /** Skip {@link NavigationTransactionPipeline.runGuards} when redirect walk already ran `leave` → `guard`. */
  skipBlockingPhases?: boolean;
}

// --- Pipeline policy ---

/** Key on {@link TransitionMap} selecting which matched routes a phase iterates. */
export type TransitionBranch = 'exitRoutes' | 'enterRoutes';

/**
 * How post-commit hook throws are handled ({@link PhaseHookTiming} `postCommit` branch).
 *
 * - `propagate` — rethrow (surfaces programmer errors)
 * - `log` — catch, log, and continue the pipeline
 */
export type PostCommitHookErrorPolicy = 'propagate' | 'log';

/**
 * When registered hooks run relative to view commit.
 *
 * Configured per phase in {@link ./lifecycle-phases!PHASES}.
 *
 * - `blocking` — before view commit; {@link NavigationShortCircuit} stops navigation
 * - `postCommit` — after view commit; cancel/redirect from hooks are ignored (warned);
 *   throws follow `onError`
 */
export type PhaseHookTiming =
  | { kind: 'blocking' }
  | { kind: 'preCommit'; onError: PostCommitHookErrorPolicy }
  | { kind: 'postCommit'; onError: PostCommitHookErrorPolicy };

/**
 * Policy when a route lifecycle callback or registered hook throws.
 *
 * Configured per phase in {@link ./lifecycle-phases!PHASES};
 * throws are handled by
 * {@link ./navigation-transaction-pipeline-phase!NavigationTransactionPipelinePhase} (private `applyErrorPolicy`).
 *
 * - `failure` — return {@link RoutePhaseFailure} for pipeline error handling
 * - `log` — log and continue (typical for post-commit cleanup phases)
 * - `propagate` — rethrow (programmer error surface)
 */
export type RoutePhaseThrowPolicy = 'failure' | 'log' | 'propagate';

// --- Phase registry ---

/**
 * Static metadata for one route lifecycle phase.
 *
 * Runtime values live in {@link ./lifecycle-phases!PHASES}.
 * `htmlAttr` / `routeHookProp` bind declarative hooks; `runRouteLifecycle` is optional
 * here and required on {@link PipelinePhaseDefinition}.
 */
export interface RoutePhaseDefinition {
  /** Phase identifier (includes terminal `error`, excluded from {@link LifecyclePhase}). */
  phase: RoutePhase;
  /** Which branch of the transition plan this phase walks. */
  targetRoutes: TransitionBranch;
  /** Blocking vs post-commit hook execution. */
  hookPolicy: PhaseHookTiming;
  /** Throw handling for route callbacks and hooks. */
  errorPolicy: RoutePhaseThrowPolicy;
  /** HTML attribute name for declarative hook binding. */
  htmlAttr?: string;
  /** Route instance property for imperative hook binding. */
  routeHookProp?: RouteHookAttrProp;
  /** Route callback invoked before registered hooks (e.g. `onGuard`, `onLeave`). */
  runRouteLifecycle?: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

/**
 * Executable pipeline phase — {@link RoutePhaseDefinition} with a required route callback.
 *
 * Passed to {@link ./navigation-transaction-pipeline!NavigationTransactionPipeline.runLifecyclePhase}.
 * `phase` excludes terminal `error` ({@link LifecyclePhase}).
 */
export type PipelinePhaseDefinition = RoutePhaseDefinition & {
  phase: LifecyclePhase;
  runRouteLifecycle: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
};

// --- Per-route phase step outcomes ---

/**
 * Result of one blocking hook evaluation on a single route.
 *
 * `null` means continue; non-`null` is a {@link NavigationShortCircuit} that stops
 * the current lifecycle phase and propagates to {@link PipelineStepResult}.
 */
export type BlockingHookStepResult = NavigationShortCircuit | null;

/**
 * Unhandled throw from a route callback or hook when `errorPolicy` is `'failure'`.
 *
 * Intermediate shape — not a terminal {@link TransactionResult}. The pipeline converts
 * this via {@link ./navigation-transaction!NavigationTransaction.fail} into {@link NavigationErrorResult}.
 *
 * Detected by {@link ./navigation-transaction-pipeline-phase!NavigationTransactionPipelinePhase.isRoutePhaseFailure}.
 */
export type RoutePhaseFailure = {
  status: 'phaseFailed';
  /** Raw error before {@link ../failure!normalizeFailure}. */
  error: unknown;
  /** Route where the throw originated. */
  route: MatchedRouteInfo;
  /** Lifecycle phase active when the throw occurred. */
  phase: LifecyclePhase;
};

/**
 * Outcome of {@link ./navigation-transaction-pipeline-phase!NavigationTransactionPipelinePhase.run}
 * for one matched route in one phase.
 *
 * - `null` — continue to the next route / phase
 * - {@link NavigationShortCircuit} — blocking short-circuit (cancel / redirect)
 * - {@link RoutePhaseFailure} — throw with `errorPolicy: 'failure'`
 */
export type RoutePhaseRunResult = BlockingHookStepResult | RoutePhaseFailure | null;

/**
 * Inputs assembled by the pipeline before building a {@link RouteLifecycleContext}.
 *
 * Mapped in {@link ./navigation-transaction-pipeline-phase!NavigationTransactionPipelinePhase.buildPhaseContext}.
 */
export type RoutePhaseContextInput = {
  from: MatchedRouteInfo | null;
  action: HistoryAction;
  router: RouterInstance;
  transactionId: number;
  transactionSignal: AbortSignal;
  /** Resolved load-hook payload for the current route, when available. */
  data?: unknown;
  /** Normalized error for the terminal `error` phase recovery path. */
  error?: unknown;
};

// --- Transaction context ---

/**
 * Transition snapshot exposed to route lifecycle hooks (not the full
 * {@link ./navigation-transaction!NavigationTransaction} — no engine refs, abort handles, or trackers).
 */
export interface NavigationTransactionSlice {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  /** Branch diff produced by `buildTransitionPlan`. */
  plan: TransitionMap;
}

/**
 * Engine orchestration context for one in-flight navigation transaction.
 *
 * Built by {@link ./navigation-transaction!NavigationTransaction.createTransactionContext}; passed to
 * {@link ./navigation-failure-handler!NavigationFailureHandler.handle} and
 * {@link ./navigation-transaction-pipeline-phase!NavigationTransactionPipelinePhase.runError}.
 */
export interface NavigationLifecycleContext {
  transaction: NavigationTransactionSlice;
  transactionId: number;
  transactionSignal: AbortSignal;
  router: RouterInstance;
  hookRegistry: HookRegistry;
  viewCommitTracker: ViewCommitTracker;
  /** Optional reporter for errors in the terminal `error` recovery phase. */
  reportHookError?: ReportNavigationHookError;
  /** Returns `false` when the transaction was aborted or superseded. */
  isJobActive: () => boolean;
  /** Load-hook snapshot attached by {@link ./navigation-transaction-pipeline!NavigationTransactionPipeline.runLoads}. */
  dataSnapshot?: DataSnapshot;
}

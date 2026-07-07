/**
 * Navigation lifecycle types — phases, branch policy, hook timing, throw policy,
 * and per-transaction orchestration context.
 *
 * Re-exports {@link GuardResult} and {@link RedirectTarget} from the shared
 * guard contract used by hooks and lifecycle execution.
 *
 * @module navigation/types
 */

import type { DataSnapshot } from '../data-graph';
import type { ReportNavigationHookError } from '../failure';
import type { HistoryAction } from '../history/provider.types';
import type { HookRegistry } from '../hooks/registry';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { RouterInstance } from '../route/types';
import type { TransitionMap } from '../route-tree/transition-plan';
import type { ViewCommitTracker } from '../view-mount/view-commit-tracker';

export type { GuardResult, RedirectTarget } from '../guard.types';

/** Branch in transition plan: exiting vs entering routes. @see {@link ../route-tree/transition-plan!TransitionMap} */
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

/** `<aura-route>` getter backing a phase attr (`guard`, `load`, `ready`, …). */
export type RouteHookAttrProp =
  | 'guard'
  | 'load'
  | 'ready'
  | 'leave'
  | 'error'
  | 'transitionIn'
  | 'transitionOut'
  | 'unmount'
  | 'update';

/** All navigation lifecycle phases, including terminal `error`. */
export type RoutePhase =
  | 'leave'
  | 'guard'
  | 'load'
  | 'update'
  | 'transitionOut'
  | 'transitionIn'
  | 'unmount'
  | 'ready'
  | 'error';

/** Pipeline-driven phases (excludes terminal `error`). */
export type LifecyclePhase = Exclude<RoutePhase, 'error'>;

/**
 * Route callback / hook throw policy.
 *
 * - `failure` — terminal navigation error
 * - `log` — log and continue (post-commit cleanup)
 * - `propagate` — rethrow (programmer error surface)
 */
export type PhaseThrowPolicy = 'failure' | 'log' | 'propagate';

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

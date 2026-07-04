/**
 * Navigation lifecycle types — phases, branch policy, hook timing, throw policy.
 *
 * Re-exports {@link GuardResult} and {@link RedirectTarget} from the shared
 * guard contract used by hooks and lifecycle execution.
 *
 * @module lifecycle/types
 */

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
  | 'reenter';

/** All navigation lifecycle phases, including terminal `error`. */
export type RoutePhase =
  | 'leave'
  | 'guard'
  | 'load'
  | 'reenter'
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

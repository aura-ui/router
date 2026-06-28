/**
 * Navigation lifecycle types — phases, branch policy, hook timing, throw policy.
 *
 * @module lifecycle/types
 */

/** Branch in transition plan: exiting vs entering routes. @see {@link ../route-tree/transition-plan!TransitionMap} */
export type LifecycleBranch = 'exitRoutes' | 'enterRoutes';

/** Post-commit hook error policy (see {@link LifecycleHookHandling}). */
export type PostCommitHookErrors = 'propagate' | 'log';

/**
 * When registered hooks run relative to view commit.
 *
 * - `blocking` — before view commit; cancel/redirect stops navigation
 * - `postCommit` — after view commit; cancel/redirect are ignored (warned).
 *   Hook errors: `propagate` throws, `log` catches and logs.
 */
export type LifecycleHookHandling =
  | { kind: 'blocking' }
  | { kind: 'postCommit'; hookErrors: PostCommitHookErrors };

/** `<aura-route>` getter backing a phase attr (`enter`, `load`, `afterHook`, …). */
export type RouteHookAttrProp =
  | 'enter'
  | 'load'
  | 'afterHook'
  | 'leave'
  | 'error'
  | 'transitionIn'
  | 'transitionOut';

/** All navigation lifecycle phases, including terminal `error`. */
export type RoutePhase =
  | 'leave'
  | 'enter'
  | 'load'
  | 'reenter'
  | 'transitionOut'
  | 'transitionIn'
  | 'left'
  | 'after'
  | 'error';

/** Pipeline-driven phases (excludes terminal `error`). */
export type LifecyclePhase = Exclude<RoutePhase, 'error'>;

/** Parsed `hooks="phase::hook-name, …"` attr on `<aura-route>`. */
export type PhaseHooksMap = Partial<Record<RoutePhase, string[]>>;

/**
 * Route callback / hook throw policy.
 *
 * - `failure` — terminal navigation error
 * - `log` — log and continue (post-commit cleanup)
 * - `propagate` — rethrow (programmer error surface)
 */
export type PhaseThrowPolicy = 'failure' | 'log' | 'propagate';

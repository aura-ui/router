import type { RouteInstance, RouteLifecycleContext, RoutePhase } from '../../../aura-route-hooks/core';
import type { TransitionMap } from '../transition/plan';

/** `ctx.phase` values that run through {@link LIFECYCLE_STEPS} (excludes `error`). */
export type LifecyclePhase = Exclude<RoutePhase, 'error'>;

export type LifecycleBranch = keyof Pick<TransitionMap, 'exitRoutes' | 'enterRoutes'>;

/** How hook results affect navigation (blocking vs post-commit). */
export type LifecycleHookHandling =
  | { kind: 'blocking' }
  | { kind: 'postCommit'; hookErrors: 'propagate' | 'log' };

/**
 * Declarative lifecycle step: branch, `ctx.phase`, lifecycle callback, and hook policy.
 * Add a row here when introducing a new route lifecycle phase.
 */
export interface LifecycleStepDef {
  lifecyclePhase: LifecyclePhase;
  branch: LifecycleBranch;
  hooks: LifecycleHookHandling;
  /** When true, lifecycle/hook throws become `{ status: 'error' }`. */
  failOnLifecycleError: boolean;
  onRoute: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

const blocking = { kind: 'blocking' } as const;
const postCommitStrict = { kind: 'postCommit', hookErrors: 'propagate' } as const;
const postCommitSafe = { kind: 'postCommit', hookErrors: 'log' } as const;

/** Registry of standard route lifecycle steps used by {@link ProcessorPipeline}. */
export const LIFECYCLE_STEPS = {
  leave: {
    lifecyclePhase: 'leave',
    branch: 'exitRoutes',
    hooks: blocking,
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onLeave(ctx),
  },
  enter: {
    lifecyclePhase: 'enter',
    branch: 'enterRoutes',
    hooks: blocking,
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onEnter(ctx),
  },
  load: {
    lifecyclePhase: 'load',
    branch: 'enterRoutes',
    hooks: blocking,
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onLoad(ctx),
  },
  reenter: {
    lifecyclePhase: 'reenter',
    branch: 'enterRoutes',
    hooks: postCommitStrict,
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onReenter(ctx),
  },
  transitionOut: {
    lifecyclePhase: 'transitionOut',
    branch: 'exitRoutes',
    hooks: postCommitStrict,
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onTransitionOut(ctx),
  },
  transitionIn: {
    lifecyclePhase: 'transitionIn',
    branch: 'enterRoutes',
    hooks: postCommitStrict,
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onTransitionIn(ctx),
  },
  left: {
    lifecyclePhase: 'left',
    branch: 'exitRoutes',
    hooks: postCommitSafe,
    failOnLifecycleError: false,
    onRoute: (route, ctx) => route.onLeft(ctx),
  },
  entered: {
    lifecyclePhase: 'entered',
    branch: 'enterRoutes',
    hooks: postCommitSafe,
    failOnLifecycleError: false,
    onRoute: (route, ctx) => route.onEntered(ctx),
  },
} as const satisfies Record<string, LifecycleStepDef>;

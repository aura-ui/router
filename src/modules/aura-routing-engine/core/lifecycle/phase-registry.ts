/**
 * Navigation phases — single source of truth for pipeline policy,
 * HTML/route attr bindings, and route lifecycle callbacks.
 *
 * @module lifecycle/phase-registry
 */

import type {
  LifecycleBranch,
  LifecycleHookHandling,
  LifecyclePhase,
  PhaseThrowPolicy,
  RouteHookAttrProp,
  RoutePhase,
} from './types';
import type { RouteInstance, RouteLifecycleContext } from '../hooks/types';

export type { PhaseThrowPolicy } from './types';

export interface PhaseDef {
  lifecyclePhase: RoutePhase;
  branch: LifecycleBranch;
  hooks: LifecycleHookHandling;
  onThrow: PhaseThrowPolicy;
  htmlAttr?: string;
  routeProp?: RouteHookAttrProp;
  onRoute?: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

/** Pipeline step — {@link PhaseDef} with required {@link PhaseDef.onRoute}. */
export type LifecycleStepDef = PhaseDef & {
  lifecyclePhase: LifecyclePhase;
  onRoute: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
};

/**
 * Per-phase configuration: policy, attr bindings, and pipeline route callback.
 *
 * @see {@link PHASES.error} — terminal phase for route attrs only (no `onRoute`)
 */
export const PHASES = {
  leave: {
    lifecyclePhase: 'leave',
    branch: 'exitRoutes',
    hooks: { kind: 'blocking' },
    onThrow: 'failure',
    htmlAttr: 'leave',
    routeProp: 'leave',
    onRoute: (route, ctx) => route.onLeave(ctx),
  },
  enter: {
    lifecyclePhase: 'enter',
    branch: 'enterRoutes',
    hooks: { kind: 'blocking' },
    onThrow: 'failure',
    htmlAttr: 'enter',
    routeProp: 'enter',
    onRoute: (route, ctx) => route.onEnter(ctx),
  },
  load: {
    lifecyclePhase: 'load',
    branch: 'enterRoutes',
    hooks: { kind: 'blocking' },
    onThrow: 'failure',
    htmlAttr: 'load',
    routeProp: 'load',
    onRoute: (route, ctx) => route.onLoad(ctx),
  },
  reenter: {
    lifecyclePhase: 'reenter',
    branch: 'enterRoutes',
    hooks: { kind: 'postCommit', hookErrors: 'propagate' },
    onThrow: 'failure',
    htmlAttr: 'reenter',
    onRoute: (route, ctx) => route.onReenter(ctx),
  },
  transitionOut: {
    lifecyclePhase: 'transitionOut',
    branch: 'exitRoutes',
    hooks: { kind: 'postCommit', hookErrors: 'propagate' },
    onThrow: 'failure',
    htmlAttr: 'transition-out',
    routeProp: 'transitionOut',
    onRoute: (route, ctx) => route.onTransitionOut(ctx),
  },
  transitionIn: {
    lifecyclePhase: 'transitionIn',
    branch: 'enterRoutes',
    hooks: { kind: 'postCommit', hookErrors: 'propagate' },
    onThrow: 'failure',
    htmlAttr: 'transition-in',
    routeProp: 'transitionIn',
    onRoute: (route, ctx) => route.onTransitionIn(ctx),
  },
  left: {
    lifecyclePhase: 'left',
    branch: 'exitRoutes',
    hooks: { kind: 'postCommit', hookErrors: 'log' },
    onThrow: 'log',
    htmlAttr: 'left',
    onRoute: (route, ctx) => route.onLeft(ctx),
  },
  after: {
    lifecyclePhase: 'after',
    branch: 'enterRoutes',
    hooks: { kind: 'postCommit', hookErrors: 'log' },
    onThrow: 'log',
    htmlAttr: 'after',
    routeProp: 'afterHook',
    onRoute: (route, ctx) => route.onAfter(ctx),
  },
  error: {
    lifecyclePhase: 'error',
    branch: 'enterRoutes',
    hooks: { kind: 'postCommit', hookErrors: 'log' },
    onThrow: 'log',
    htmlAttr: 'error',
    routeProp: 'error',
  },
} as const satisfies Record<RoutePhase, PhaseDef>;

/** Pipeline-driven phase keys (excludes terminal `error`). */
export const LIFECYCLE_PHASES = (
  Object.keys(PHASES) as RoutePhase[]
).filter((phase): phase is LifecyclePhase => phase !== 'error');

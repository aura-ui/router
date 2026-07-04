/**
 * Navigation phases — single source of truth for pipeline policy,
 * HTML/route attr bindings, and route lifecycle callbacks.
 *
 * @module lifecycle/phase-registry
 */

import type { RouteErrorContext, RouteInstance, RouteLifecycleContext } from '../route/types';

import type {
  LifecycleBranch,
  LifecycleHookHandling,
  LifecyclePhase,
  PhaseThrowPolicy,
  RouteHookAttrProp,
  RoutePhase,
} from './types';

export type { PhaseThrowPolicy } from './types';

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

/**
 * Per-phase configuration: policy, attr bindings, and pipeline route callback.
 *
 * @see {@link PHASES.error} — terminal recovery phase (not in {@link PIPELINE_PHASES})
 */
export const PHASES = {
  leave: {
    phase: 'leave',
    targetRoutes: 'exitRoutes',
    hookPolicy: { kind: 'blocking' },
    errorPolicy: 'failure',
    htmlAttr: 'leave',
    routeHookProp: 'leave',
    runRouteLifecycle: (route, ctx) => route.onLeave(ctx),
  },
  enter: {
    phase: 'enter',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'blocking' },
    errorPolicy: 'failure',
    htmlAttr: 'enter',
    routeHookProp: 'enter',
    runRouteLifecycle: (route, ctx) => route.onEnter(ctx),
  },
  load: {
    phase: 'load',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'blocking' },
    errorPolicy: 'failure',
    htmlAttr: 'load',
    routeHookProp: 'load',
    runRouteLifecycle: (route, ctx) => route.onLoad(ctx),
  },
  reenter: {
    phase: 'reenter',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'postCommit', onError: 'propagate' },
    errorPolicy: 'failure',
    htmlAttr: 'reenter',
    routeHookProp: 'reenter',
    runRouteLifecycle: (route, ctx) => route.onReenter(ctx),
  },
  transitionOut: {
    phase: 'transitionOut',
    targetRoutes: 'exitRoutes',
    hookPolicy: { kind: 'postCommit', onError: 'propagate' },
    errorPolicy: 'failure',
    htmlAttr: 'transition-out',
    routeHookProp: 'transitionOut',
    runRouteLifecycle: (route, ctx) => route.onTransitionOut(ctx),
  },
  transitionIn: {
    phase: 'transitionIn',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'postCommit', onError: 'propagate' },
    errorPolicy: 'failure',
    htmlAttr: 'transition-in',
    routeHookProp: 'transitionIn',
    runRouteLifecycle: (route, ctx) => route.onTransitionIn(ctx),
  },
  left: {
    phase: 'left',
    targetRoutes: 'exitRoutes',
    hookPolicy: { kind: 'postCommit', onError: 'log' },
    errorPolicy: 'log',
    htmlAttr: 'left',
    routeHookProp: 'left',
    runRouteLifecycle: (route, ctx) => route.onLeft(ctx),
  },
  after: {
    phase: 'after',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'postCommit', onError: 'log' },
    errorPolicy: 'log',
    htmlAttr: 'after',
    routeHookProp: 'afterHook',
    runRouteLifecycle: (route, ctx) => route.onAfter(ctx),
  },
  error: {
    phase: 'error',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'postCommit', onError: 'log' },
    errorPolicy: 'log',
    htmlAttr: 'error',
    routeHookProp: 'error',
    runRouteLifecycle: (route, ctx) => route.onError(ctx as RouteErrorContext),
  },
} as const satisfies Record<RoutePhase, RoutePhaseDefinition>;

/** Pipeline-driven phase keys (excludes terminal `error`). */
export const PIPELINE_PHASES = (
  Object.keys(PHASES) as RoutePhase[]
).filter((phase): phase is LifecyclePhase => phase !== 'error');

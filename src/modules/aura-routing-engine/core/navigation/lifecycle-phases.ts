/**
 * Navigation phases — single source of truth for pipeline policy,
 * HTML/route attr bindings, and route lifecycle callbacks.
 *
 * @module navigation/lifecycle-phases
 */

import type { RouteErrorContext, RoutePhase, LifecyclePhase } from '../route/types';

import type { RoutePhaseDefinition } from './types';

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
  guard: {
    phase: 'guard',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'blocking' },
    errorPolicy: 'failure',
    htmlAttr: 'guard',
    routeHookProp: 'guard',
    runRouteLifecycle: (route, ctx) => route.onGuard(ctx),
  },
  load: {
    phase: 'load',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'preCommit', onError: 'propagate' },
    errorPolicy: 'failure',
    htmlAttr: 'load',
    routeHookProp: 'load',
    runRouteLifecycle: (route, ctx) => route.onLoad(ctx),
  },
  update: {
    phase: 'update',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'preCommit', onError: 'propagate' },
    errorPolicy: 'failure',
    htmlAttr: 'update',
    routeHookProp: 'update',
    runRouteLifecycle: (route, ctx) => route.onUpdate(ctx),
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
  unmount: {
    phase: 'unmount',
    targetRoutes: 'exitRoutes',
    hookPolicy: { kind: 'postCommit', onError: 'log' },
    errorPolicy: 'log',
    htmlAttr: 'unmount',
    routeHookProp: 'unmount',
    runRouteLifecycle: (route, ctx) => route.onUnmount(ctx),
  },
  ready: {
    phase: 'ready',
    targetRoutes: 'enterRoutes',
    hookPolicy: { kind: 'postCommit', onError: 'log' },
    errorPolicy: 'log',
    htmlAttr: 'ready',
    routeHookProp: 'ready',
    runRouteLifecycle: (route, ctx) => route.onReady(ctx),
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

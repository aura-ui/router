/**
 * Navigation phase registry — single source of truth for pipeline policy,
 * HTML/route attr bindings, and route lifecycle callbacks.
 *
 * @module lifecycle/phase-registry
 */

import type {
  LifecycleBranch,
  LifecycleHookHandling,
  LifecyclePhase,
  PhaseDefinition,
  RouteHookAttrProp,
  RouteInstance,
  RouteLifecycleContext,
  RoutePhase,
} from '../hooks/types';

export type PhaseHookPolicy = 'blocking' | 'bestEffort';

/**
 * Route callback / hook throw policy.
 *
 * - `failure` — terminal navigation error
 * - `log` — log and continue (post-commit cleanup)
 * - `propagate` — rethrow (programmer error surface)
 */
export type PhaseThrowPolicy = 'failure' | 'log' | 'propagate';

interface PhaseRegistryEntry {
  lifecyclePhase: RoutePhase;
  branch: LifecycleBranch;
  hookPolicy: PhaseHookPolicy;
  onThrow: PhaseThrowPolicy;
  htmlAttr?: string;
  routeProp?: RouteHookAttrProp;
  onRoute?: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

type PipelinePhaseRegistryEntry = PhaseRegistryEntry & {
  lifecyclePhase: LifecyclePhase;
  onRoute: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
};

export interface LifecycleStepDef {
  lifecyclePhase: LifecyclePhase;
  branch: LifecycleBranch;
  hooks: LifecycleHookHandling;
  onThrow: PhaseThrowPolicy;
  onRoute: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

/** Authoring-time `hookPolicy` → runtime {@link LifecycleHookHandling}. */
export function hookPolicyToHookHandling(
  hookPolicy: PhaseHookPolicy,
  onThrow: PhaseThrowPolicy,
): LifecycleHookHandling {
  if (hookPolicy === 'blocking') {
    return { kind: 'blocking' };
  }

  return {
    kind: 'postCommit',
    hookErrors: onThrow === 'log' ? 'log' : 'propagate',
  };
}

function toPhaseDefinition(entry: PhaseRegistryEntry): PhaseDefinition {
  return {
    lifecyclePhase: entry.lifecyclePhase,
    branch: entry.branch,
    hooks: hookPolicyToHookHandling(entry.hookPolicy, entry.onThrow),
    onThrow: entry.onThrow,
    ...(entry.htmlAttr !== undefined && { htmlAttr: entry.htmlAttr }),
    ...(entry.routeProp !== undefined && { routeProp: entry.routeProp }),
  };
}

function toLifecycleStep(entry: PipelinePhaseRegistryEntry): LifecycleStepDef {
  return {
    lifecyclePhase: entry.lifecyclePhase,
    branch: entry.branch,
    hooks: hookPolicyToHookHandling(entry.hookPolicy, entry.onThrow),
    onThrow: entry.onThrow,
    onRoute: entry.onRoute,
  };
}

/**
 * Per-phase configuration: policy, attr bindings, and pipeline route callback.
 *
 * @see {@link PHASE_REGISTRY.error} — terminal phase for route attrs only (no `onRoute`)
 */
export const PHASE_REGISTRY = {
  leave: {
    lifecyclePhase: 'leave',
    branch: 'exitRoutes',
    hookPolicy: 'blocking',
    onThrow: 'failure',
    htmlAttr: 'leave',
    routeProp: 'leave',
    onRoute: (route, ctx) => route.onLeave(ctx),
  },
  enter: {
    lifecyclePhase: 'enter',
    branch: 'enterRoutes',
    hookPolicy: 'blocking',
    onThrow: 'failure',
    htmlAttr: 'enter',
    routeProp: 'enter',
    onRoute: (route, ctx) => route.onEnter(ctx),
  },
  load: {
    lifecyclePhase: 'load',
    branch: 'enterRoutes',
    hookPolicy: 'blocking',
    onThrow: 'failure',
    htmlAttr: 'load',
    routeProp: 'load',
    onRoute: (route, ctx) => route.onLoad(ctx),
  },
  reenter: {
    lifecyclePhase: 'reenter',
    branch: 'enterRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'failure',
    htmlAttr: 'reenter',
    onRoute: (route, ctx) => route.onReenter(ctx),
  },
  transitionOut: {
    lifecyclePhase: 'transitionOut',
    branch: 'exitRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'failure',
    htmlAttr: 'transition-out',
    routeProp: 'transitionOut',
    onRoute: (route, ctx) => route.onTransitionOut(ctx),
  },
  transitionIn: {
    lifecyclePhase: 'transitionIn',
    branch: 'enterRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'failure',
    htmlAttr: 'transition-in',
    routeProp: 'transitionIn',
    onRoute: (route, ctx) => route.onTransitionIn(ctx),
  },
  left: {
    lifecyclePhase: 'left',
    branch: 'exitRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'log',
    htmlAttr: 'left',
    onRoute: (route, ctx) => route.onLeft(ctx),
  },
  after: {
    lifecyclePhase: 'after',
    branch: 'enterRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'log',
    htmlAttr: 'after',
    routeProp: 'afterHook',
    onRoute: (route, ctx) => route.onAfter(ctx),
  },
  error: {
    lifecyclePhase: 'error',
    branch: 'enterRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'log',
    htmlAttr: 'error',
    routeProp: 'error',
  },
} as const satisfies Record<RoutePhase, PhaseRegistryEntry>;

const LIFECYCLE_PHASES = [
  'leave',
  'enter',
  'load',
  'reenter',
  'transitionOut',
  'transitionIn',
  'left',
  'after',
] as const satisfies readonly LifecyclePhase[];

/** Hook-layer phase metadata derived from {@link PHASE_REGISTRY}. */
export const NAVIGATION_PHASES = Object.fromEntries(
  (Object.keys(PHASE_REGISTRY) as RoutePhase[]).map((phase) => [
    phase,
    toPhaseDefinition(PHASE_REGISTRY[phase]),
  ]),
) as Record<RoutePhase, PhaseDefinition>;

/** Pipeline lifecycle steps derived from {@link PHASE_REGISTRY}. */
export const LIFECYCLE_STEPS = Object.fromEntries(
  LIFECYCLE_PHASES.map((phase) => [phase, toLifecycleStep(PHASE_REGISTRY[phase])]),
) as Record<LifecyclePhase, LifecycleStepDef>;

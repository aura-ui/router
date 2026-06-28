import type {
  LifecycleBranch,
  LifecycleHookHandling,
  LifecyclePhase,
  RouteInstance,
  RouteLifecycleContext,
} from '../hooks/types';
import {
  PHASE_SPEC,
  phaseSpecPolicy,
  phaseSpecToHookHandling,
  type PhaseThrowPolicy,
} from './phase-spec';

export type { LifecyclePhase, LifecycleBranch, LifecycleHookHandling, PhaseThrowPolicy };

export interface LifecycleStepDef {
  lifecyclePhase: LifecyclePhase;
  branch: LifecycleBranch;
  hooks: LifecycleHookHandling;
  onThrow: PhaseThrowPolicy;
  onRoute: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

function stepFromSpec(
  spec: (typeof PHASE_SPEC)[LifecyclePhase],
  onRoute: LifecycleStepDef['onRoute'],
): LifecycleStepDef {
  return {
    ...phaseSpecPolicy(spec),
    hooks: phaseSpecToHookHandling(spec),
    onRoute,
  };
}

/** Pipeline lifecycle steps derived from {@link PHASE_SPEC}. */
export const LIFECYCLE_STEPS = {
  leave: stepFromSpec(PHASE_SPEC.leave, (route, ctx) => route.onLeave(ctx)),
  enter: stepFromSpec(PHASE_SPEC.enter, (route, ctx) => route.onEnter(ctx)),
  load: stepFromSpec(PHASE_SPEC.load, (route, ctx) => route.onLoad(ctx)),
  reenter: stepFromSpec(PHASE_SPEC.reenter, (route, ctx) => route.onReenter(ctx)),
  transitionOut: stepFromSpec(PHASE_SPEC.transitionOut, (route, ctx) => route.onTransitionOut(ctx)),
  transitionIn: stepFromSpec(PHASE_SPEC.transitionIn, (route, ctx) => route.onTransitionIn(ctx)),
  left: stepFromSpec(PHASE_SPEC.left, (route, ctx) => route.onLeft(ctx)),
  after: stepFromSpec(PHASE_SPEC.after, (route, ctx) => route.onAfter(ctx)),
} as const satisfies Record<LifecyclePhase, LifecycleStepDef>;

/** Pipeline policy without {@link LifecycleStepDef.onRoute}. */
export function lifecycleStepPolicy(
  step: LifecycleStepDef,
): Omit<LifecycleStepDef, 'onRoute'> {
  return {
    lifecyclePhase: step.lifecyclePhase,
    branch: step.branch,
    hooks: step.hooks,
    onThrow: step.onThrow,
  };
}

export { PHASE_SPEC, phaseSpecToHookHandling } from './phase-spec';

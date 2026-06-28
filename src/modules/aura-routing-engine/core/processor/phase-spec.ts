import type {
  LifecycleBranch,
  LifecycleHookHandling,
  LifecyclePhase,
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

interface PhaseSpecEntry {
  phase: LifecyclePhase;
  branch: LifecycleBranch;
  hookPolicy: PhaseHookPolicy;
  onThrow: PhaseThrowPolicy;
}

/** Pipeline lifecycle policy — single source of truth for phase behavior. */
export const PHASE_SPEC = {
  leave: {
    phase: 'leave',
    branch: 'exitRoutes',
    hookPolicy: 'blocking',
    onThrow: 'failure',
  },
  enter: {
    phase: 'enter',
    branch: 'enterRoutes',
    hookPolicy: 'blocking',
    onThrow: 'failure',
  },
  load: {
    phase: 'load',
    branch: 'enterRoutes',
    hookPolicy: 'blocking',
    onThrow: 'failure',
  },
  reenter: {
    phase: 'reenter',
    branch: 'enterRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'failure',
  },
  transitionOut: {
    phase: 'transitionOut',
    branch: 'exitRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'failure',
  },
  transitionIn: {
    phase: 'transitionIn',
    branch: 'enterRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'failure',
  },
  left: {
    phase: 'left',
    branch: 'exitRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'log',
  },
  after: {
    phase: 'after',
    branch: 'enterRoutes',
    hookPolicy: 'bestEffort',
    onThrow: 'log',
  },
} as const satisfies Record<LifecyclePhase, PhaseSpecEntry>;

/** Maps {@link PHASE_SPEC} to hook-layer {@link LifecycleHookHandling}. */
export function phaseSpecToHookHandling(spec: PhaseSpecEntry): LifecycleHookHandling {
  if (spec.hookPolicy === 'blocking') {
    return { kind: 'blocking' };
  }

  return {
    kind: 'postCommit',
    hookErrors: spec.onThrow === 'log' ? 'log' : 'propagate',
  };
}

/** Pipeline fields derived from {@link PHASE_SPEC} (without build-only `hookPolicy`). */
export function phaseSpecPolicy(spec: PhaseSpecEntry): {
  lifecyclePhase: LifecyclePhase;
  branch: LifecycleBranch;
  onThrow: PhaseThrowPolicy;
} {
  return {
    lifecyclePhase: spec.phase,
    branch: spec.branch,
    onThrow: spec.onThrow,
  };
}

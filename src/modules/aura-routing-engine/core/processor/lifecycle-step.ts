import type {
  LifecycleBranch,
  LifecycleHookHandling,
  LifecyclePhase,
  RouteInstance,
  RouteLifecycleContext,
} from '../hooks/types';

export type { LifecyclePhase, LifecycleBranch, LifecycleHookHandling };

export interface LifecycleStepDef {
  lifecyclePhase: LifecyclePhase;
  branch: LifecycleBranch;
  hooks: LifecycleHookHandling;
  failOnLifecycleError: boolean;
  onRoute: (route: RouteInstance, ctx: RouteLifecycleContext) => void;
}

const blocking = { kind: 'blocking' } as const satisfies LifecycleHookHandling;
const postCommit = (hookErrors: 'propagate' | 'log') =>
  ({ kind: 'postCommit', hookErrors }) as const satisfies LifecycleHookHandling;

/** Pipeline lifecycle steps — source of truth for branch, hook timing, and error policy. */
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
    hooks: postCommit('propagate'),
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onReenter(ctx),
  },
  transitionOut: {
    lifecyclePhase: 'transitionOut',
    branch: 'exitRoutes',
    hooks: postCommit('propagate'),
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onTransitionOut(ctx),
  },
  transitionIn: {
    lifecyclePhase: 'transitionIn',
    branch: 'enterRoutes',
    hooks: postCommit('propagate'),
    failOnLifecycleError: true,
    onRoute: (route, ctx) => route.onTransitionIn(ctx),
  },
  left: {
    lifecyclePhase: 'left',
    branch: 'exitRoutes',
    hooks: postCommit('log'),
    failOnLifecycleError: false,
    onRoute: (route, ctx) => route.onLeft(ctx),
  },
  after: {
    lifecyclePhase: 'after',
    branch: 'enterRoutes',
    hooks: postCommit('log'),
    failOnLifecycleError: false,
    onRoute: (route, ctx) => route.onAfter(ctx),
  },
} as const satisfies Record<LifecyclePhase, LifecycleStepDef>;

/** Pipeline policy without {@link LifecycleStepDef.onRoute}. */
export function lifecycleStepPolicy(
  step: LifecycleStepDef,
): Omit<LifecycleStepDef, 'onRoute'> {
  return {
    lifecyclePhase: step.lifecyclePhase,
    branch: step.branch,
    hooks: step.hooks,
    failOnLifecycleError: step.failOnLifecycleError,
  };
}

export { blocking, postCommit };

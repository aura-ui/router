import type { HistoryAction } from '../history';
import type { RedirectTarget } from '../guard.types';
import type { RouteTransition } from '../transition/route-transition';

export type { RouteTransition };

/** Lifecycle branch in {@link TransitionMap}. */
export type LifecycleBranch = 'exitRoutes' | 'enterRoutes';

export type PostCommitHookErrors = 'propagate' | 'log';

/** How registered hooks run during a lifecycle step. */
export type LifecycleHookHandling =
  | { kind: 'blocking' }
  | { kind: 'postCommit'; hookErrors: PostCommitHookErrors };

/** `<aura-route>` property holding hook names for a phase (comma-separated attr). */
export type RouteHookAttrProp =
  | 'enter'
  | 'load'
  | 'afterHook'
  | 'leave'
  | 'error'
  | 'transitionIn'
  | 'transitionOut';

/** Hook phase metadata — same pipeline fields as {@link LifecycleStepDef} + HTML/route bindings. */
export interface PhaseDefinition {
  readonly lifecyclePhase: RoutePhase;
  readonly branch: LifecycleBranch;
  readonly hooks: LifecycleHookHandling;
  readonly failOnLifecycleError: boolean;
  readonly htmlAttr?: string;
  readonly routeProp?: RouteHookAttrProp;
}

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

/** Phases driven by {@link LIFECYCLE_STEPS} in processor (excludes terminal `error`). */
export type LifecyclePhase = Exclude<RoutePhase, 'error'>;

/** Parsed `hooks="phase::hook-name, ..."`. */
export type PhaseHooksMap = Partial<Record<RoutePhase, string[]>>;

export interface RouteInfo {
  pathname: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface RouterInstance {
  navigate(path: string, options?: { replace?: boolean; syncHistory?: boolean }): void;
}

/** Route attrs used to resolve registered hook names per phase. */
export interface RouteHookNamesSource {
  enter: string[] | null;
  load: string[] | null;
  afterHook: string[] | null;
  leave: string[] | null;
  error: string[] | null;
  transitionIn: string[] | null;
  transitionOut: string[] | null;
  hooks?: PhaseHooksMap | null;
}

export interface RouteLifecycleContext {
  phase: RoutePhase;
  to: RouteInfo;
  from: RouteInfo | null;
  router: RouterInstance;
  route: RouteInstance;
  action: HistoryAction;
  jobId: number;
  signal: AbortSignal;
  error?: unknown;
}

export type RouteErrorContext = RouteLifecycleContext & {
  error: unknown;
};

/** Route surface for the routing engine and registered hooks. */
export interface RouteInstance extends RouteHookNamesSource {
  path: string;
  readonly transition: RouteTransition;
  onEnter(ctx: RouteLifecycleContext): void;
  onTransitionIn(ctx: RouteLifecycleContext): void;
  onLoad(ctx: RouteLifecycleContext): void;
  onAfter(ctx: RouteLifecycleContext): void;
  onLeave(ctx: RouteLifecycleContext): void;
  onTransitionOut(ctx: RouteLifecycleContext): void;
  onLeft(ctx: RouteLifecycleContext): void;
  onReenter(ctx: RouteLifecycleContext): void;
  onError(ctx: RouteErrorContext): void;
  commitStagedView?(): void;
}

export interface RouteHookContext<TOptions = Record<string, unknown>>
  extends RouteLifecycleContext {
  options: TOptions;
}

export type HookResult =
  | void
  | { readonly type: 'continue' }
  | { readonly type: 'cancel' }
  | { readonly type: 'redirect'; url: string; replace?: boolean };

export type HookResultInput = HookResult | boolean | RedirectTarget;

type RouteHookFn<TOptions> = (ctx: RouteHookContext<TOptions>) => Promise<HookResultInput>;

export interface RouteHookDefinition<TOptions = Record<string, unknown>> {
  name: string;
  version: string;
  fn: RouteHookFn<TOptions>;
  requires?: string;
  phases?: readonly RoutePhase[];
}

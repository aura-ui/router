/**
 * Route hook types — lifecycle context, hook definitions, and phase metadata.
 *
 * **Runtime wiring:** route attrs / `hooks="phase::name"` pick *when* a hook runs;
 * {@link RouteHookDefinition} registers *what* runs. Phase policy lives in
 * {@link ../processor/lifecycle/lifecycle-steps!LIFECYCLE_STEPS}.
 *
 * @module hooks/types
 */

import type { HistoryAction } from '../history';
import type { RedirectTarget } from '../guard.types';
import type { RouteTransition } from '../transition/route-transition';
import type { PhaseThrowPolicy } from '../processor/lifecycle/lifecycle-policy';

export type { RouteTransition };

/** Branch in transition plan: exiting vs entering routes. @see {@link ../transition/plan!TransitionMap} */
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

/** Phase metadata for hooks layer: pipeline policy + HTML/route bindings. */
export interface PhaseDefinition {
  readonly lifecyclePhase: RoutePhase;
  readonly branch: LifecycleBranch;
  readonly hooks: LifecycleHookHandling;
  readonly onThrow: PhaseThrowPolicy;
  /** kebab-case attr name when it differs from {@link RoutePhase}. */
  readonly htmlAttr?: string;
  readonly routeProp?: RouteHookAttrProp;
}

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

/** Target route slice passed to lifecycle callbacks and hooks. */
export interface RouteInfo {
  pathname: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/** Minimal router surface exposed to hooks (`ctx.router`). */
export interface RouterInstance {
  navigate(path: string, options?: { replace?: boolean; syncHistory?: boolean }): void;
}

/**
 * Route hook name sources — phase attrs plus optional `hooks` map.
 *
 * @example
 * ```html
 * <aura-route path="/admin" enter="auth" after="analytics"></aura-route>
 * <!-- `after` attr → route.afterHook; or use hooks="after::analytics" -->
 * ```
 */
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

/**
 * Context for route lifecycle callbacks and registered hooks.
 *
 * `signal` aborts when the navigation job is superseded — long async hooks should check it.
 */
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

/** {@link RouteLifecycleContext} for the terminal `error` phase (`error` is required). */
export type RouteErrorContext = RouteLifecycleContext & {
  error: unknown;
};

/** Route surface used by the routing engine and hook runtime. */
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

/** Per-registration options from `AuraRouter.use(hook, options)`. */
export interface RouteHookContext<TOptions = Record<string, unknown>>
  extends RouteLifecycleContext {
  options: TOptions;
}

/**
 * Explicit hook return shapes (preferred over legacy boolean/string).
 *
 * @see {@link HookResultInput} for all accepted return types
 */
export type HookResult =
  | void
  | { readonly type: 'continue' }
  | { readonly type: 'cancel' }
  | { readonly type: 'redirect'; url: string; replace?: boolean };

/**
 * Values a hook fn may return — normalized to `GuardResult` by {@link ./registry!normalizeHookResult}.
 *
 * @example Legacy redirect
 * ```ts
 * return '/login';
 * return { url: '/login', replace: true };
 * ```
 *
 * @example Explicit shapes
 * ```ts
 * return { type: 'cancel' };
 * return { type: 'redirect', url: '/home' };
 * ```
 */
export type HookResultInput = HookResult | boolean | RedirectTarget;

type RouteHookFn<TOptions> = (ctx: RouteHookContext<TOptions>) => Promise<HookResultInput>;

/**
 * Registered route hook — global by name, invoked when a route references it.
 *
 * @example
 * ```ts
 * export const authHook = defineRouteHook({
 *   name: 'auth',
 *   version: '1.0.0',
 *   requires: '>=0.1.0',
 *   fn: async (ctx) => {
 *     if (!isLoggedIn()) return ctx.options.redirect ?? '/login';
 *   },
 * });
 * AuraRouter.use(authHook, { redirect: '/login' });
 * ```
 */
export interface RouteHookDefinition<TOptions = Record<string, unknown>> {
  /** kebab-case identifier; referenced from route attrs and `hooks="phase::name"`. */
  name: string;
  /** Hook semver (logged on replacement). */
  version: string;
  fn: RouteHookFn<TOptions>;
  /** Router API semver range; {@link ./registry!HookRegistry.register} throws when not satisfied. */
  requires?: string;
}

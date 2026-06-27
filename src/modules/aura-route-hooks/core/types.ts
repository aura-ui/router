import type { MatchedRouteInfo, HistoryAction } from '../../aura-routing-engine/core';
import type { TransitionPolicy } from '../../aura-routing-engine/core/transition/policy';

export type { MatchedRouteInfo, HistoryAction };

export type RoutePhase =
  | 'enter'
  | 'transitionIn'
  | 'load'
  | 'after'
  | 'leave'
  | 'transitionOut'
  | 'left'
  | 'reenter'
  | 'error';

/** Parsed `hooks="phase::hook-name, ..."`. */
export type PhaseHooksMap = Partial<Record<RoutePhase, string[]>>;

/** Resolved transition package from route attrs (`transition`, `transition-order`, …). */
export interface RouteTransition {
  /** `null` — inactive package (replace mount, skip transition phases). */
  order: TransitionPolicy | null;
  in: string[] | null;
  out: string[] | null;
}

export const NO_TRANSITION: RouteTransition = { order: null, in: null, out: null };

export interface RouteInfo {
  /** Browser pathname (no `search` / `hash`), e.g. `/user/42`. */
  pathname: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/** Minimal router surface exposed to route hooks. */
export interface RouterInstance {
  navigate(path: string, options?: { replace?: boolean; syncHistory?: boolean }): void;
}

export interface RouteLifecycleContext {
  phase: RoutePhase;
  to: RouteInfo;
  from: RouteInfo | null;
  router: RouterInstance;
  route: RouteInstance;
  /** Как инициирован переход: push | replace | pop | system. */
  action: HistoryAction;
  jobId: number;
  signal: AbortSignal;
  error?: unknown;
}

export type RouteErrorContext = RouteLifecycleContext & {
  error: unknown;
};

/** Minimal route surface required by hooks and the routing engine. */
export interface RouteInstance {
  path: string;
  enter: string[] | null;
  transitionIn: string[] | null;
  load: string[] | null;
  after: string[] | null;
  leave: string[] | null;
  transitionOut: string[] | null;
  error: string[] | null;
  /** `hooks="phase::hook-name"` — left, reenter, transitions, etc. */
  hooks?: PhaseHooksMap | null;
  /** Resolved transition package (`transition`, `transition-order`, …). */
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
  /**
   * Commits a staged incoming view in the outlet (`commitStage`); no-op without staged mount.
   * Invoked on the enter branch after transition hooks, before exit `onLeft`.
   */
  commitStagedView?(): void;
}

/** Hook context: lifecycle + plugin options from `AuraRouter.use(hook, options)`. */
export interface RouteHookContext extends RouteLifecycleContext {
  options: Record<string, unknown>;
}

/** Логика hook — без фазы */
type RouteHookFn = (ctx: RouteHookContext) => Promise<boolean | void | string>;

/** Дескриптор route hook */
export interface RouteHookDefinition {
  name: string;   // hooks="auth" в HTML — стабильный public ID
  version: string; // semver hook-модуля, не версия роутера
  fn: RouteHookFn;
  requires?: string; // опционально: ">=0.2.0" — совместимость API роутера (>=, >, <=, <, =)
}

export function defineRouteHook(def: RouteHookDefinition): Readonly<RouteHookDefinition> {
  if (!def.name || !/^[a-z][a-z0-9-]*$/.test(def.name)) {
    throw new Error(`Invalid hook name: "${def.name}"`);
  }
  return Object.freeze({ ...def, fn: def.fn });
}

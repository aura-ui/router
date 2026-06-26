import type { MatchedRouteInfo, HistoryAction } from '../../aura-routing-engine/core';

export type { MatchedRouteInfo, HistoryAction };

export type RoutePhase =
  | 'enter'
  | 'transitionIn'
  | 'load'
  | 'entered'
  | 'leave'
  | 'transitionOut'
  | 'left'
  | 'reenter'
  | 'error';

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
  entered: string[] | null;
  leave: string[] | null;
  transitionOut: string[] | null;
  left: string[] | null;
  reenter: string[] | null;
  error: string[] | null;
  onEnter(ctx: RouteLifecycleContext): void;
  onTransitionIn(ctx: RouteLifecycleContext): void;
  onLoad(ctx: RouteLifecycleContext): void;
  onEntered(ctx: RouteLifecycleContext): void;
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
  /** Link-driven content prefetch with resolved match info. */
  prefetchContent?(routeInfo: MatchedRouteInfo, signal: AbortSignal): Promise<void>;
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

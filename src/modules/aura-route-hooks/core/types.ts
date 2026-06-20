import type { MatchedRouteInfo } from '../../aura-routing-engine/core/aura-routing-url-matcher';
import type { HistoryAction } from '../../aura-routing-engine/core/navigation-provider.types';

export type { MatchedRouteInfo, HistoryAction };

export type RoutePhase =
  | 'enter'
  | 'entering'
  | 'load'
  | 'entered'
  | 'leave'
  | 'leaving'
  | 'left'
  | 'reentered'
  | 'error';

export interface RouteInfo {
  path: string;
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
  entering: string[] | null;
  load: string[] | null;
  entered: string[] | null;
  leave: string[] | null;
  leaving: string[] | null;
  left: string[] | null;
  reentered: string[] | null;
  error: string[] | null;
  onEnter(ctx: RouteLifecycleContext): void;
  onEntering(ctx: RouteLifecycleContext): void;
  onLoad(ctx: RouteLifecycleContext): void;
  onEntered(ctx: RouteLifecycleContext): void;
  onLeave(ctx: RouteLifecycleContext): void;
  onLeaving(ctx: RouteLifecycleContext): void;
  onLeft(ctx: RouteLifecycleContext): void;
  onReentered(ctx: RouteLifecycleContext): void;
  onError(ctx: RouteErrorContext): void;
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

import type { MatchedRouteInfo } from '../../aura-routing-engine/core/aura-routing-url-matcher';

export type { MatchedRouteInfo };

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

/** Error phase: matched route snapshot + thrown error. */
export type RouteErrorContext = MatchedRouteInfo & {
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
  onEnter(ctx: MatchedRouteInfo): void;
  onEntering(ctx: MatchedRouteInfo): void;
  onLoad(ctx: MatchedRouteInfo): void;
  onEntered(ctx: MatchedRouteInfo): void;
  onLeaving(ctx: MatchedRouteInfo): void;
  onLeft(ctx: MatchedRouteInfo): void;
  onReentered(ctx: MatchedRouteInfo): void;
  onError(ctx: RouteErrorContext): void;
}



/** Hook context: {@link MatchedRouteInfo} + plugin options from `AuraRouter.use(hook, options)`. */
export interface RouteHookContext extends MatchedRouteInfo {
  options: Record<string, unknown>;
  /** Set on the `error` phase when load or render fails. */
  error?: unknown;
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

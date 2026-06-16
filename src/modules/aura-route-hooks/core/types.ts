export type RoutePhase = 'enter' | 'entered' | 'leave' | 'left' | 'reentered';

export interface RouteInfo {
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/** Minimal route surface required by hooks and the routing engine. */
export interface RouteInstance {
  path: string;
  enter: string[];
  entered: string[];
  leave: string[];
  left: string[];
  reentered: string[];
  onEnter(ctx: RouteLifecycleContext): void;
  onEntered(ctx: RouteLifecycleContext): void;
  onLeft(ctx: RouteLifecycleContext): void;
  onReentered(ctx: RouteLifecycleContext): void;
}

/** Minimal router surface exposed to route hooks. */
export interface RouterInstance {
  navigate(path: string): void;
}

export interface RouteLifecycleContext {
  phase: RoutePhase;
  to: RouteInfo;
  from: RouteInfo | null;
  router: RouterInstance;
  route: RouteInstance;
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

export interface RouteHookContext extends RouteLifecycleContext {
  options: Record<string, unknown>;
}

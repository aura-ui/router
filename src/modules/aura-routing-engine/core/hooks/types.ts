/**
 * Route hook registration types — definitions, results, and hook context.
 *
 * Route contract: {@link ../route/types}.
 *
 * @module hooks/types
 */

import type { RedirectTarget } from '../guard.types';
import type { RouteLifecycleContext } from '../route/types';

export type {
  LifecyclePhase,
  RouteHookAttrProp,
  RoutePhase,
} from '../route/types';

/** Per-registration options from `AuraRouter.use(hook, options)`. */
export interface RouteHookContext<
  TOptions = Record<string, unknown>,
> extends RouteLifecycleContext {
  options: TOptions;
}

/**
 * Explicit object forms for hook control results.
 *
 * @see {@link HookResultInput} for concise boolean/string forms
 */
export type HookResult =
  | void
  | { readonly type: 'continue' }
  | { readonly type: 'cancel'; reason?: string }
  | { readonly type: 'redirect'; url: string; replace?: boolean };

/**
 * Values a hook fn may return — normalized to `GuardResult` by {@link ./registry!normalizeHookResult}.
 */
export type HookResultInput = HookResult | boolean | RedirectTarget;

export type RouteHookFn<TOptions = Record<string, unknown>> = (ctx: RouteHookContext<TOptions>) => HookResultInput | Promise<HookResultInput>;

/** Data-producing `load` hook. Its return value becomes route data. */
export type RouteLoadFn<TData = unknown, TOptions = Record<string, unknown>> = (ctx: RouteHookContext<TOptions>) => TData | Promise<TData>;

/** Function accepted by the shared registry; its phase determines return-value semantics. */
export type RouteHookHandler<TOptions = Record<string, unknown>> =
  | RouteHookFn<TOptions>
  | RouteLoadFn<unknown, TOptions>;

/**
 * Registered route hook — global by name, invoked when a route references it.
 */
export interface RouteHookDefinition<TOptions = Record<string, unknown>> {
  /** Identifier for route phase attrs — Unicode letters (no uppercase), digits, hyphens. */
  name: string;
  /** Hook semver (logged on replacement). */
  version: string;
  fn: RouteHookHandler<TOptions>;
  /** Router API semver range; {@link ./registry!HookRegistry.register} throws when not satisfied. */
  requires?: string;
}

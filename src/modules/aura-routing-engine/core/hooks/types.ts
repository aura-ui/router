/**
 * Route hook registration types — definitions, results, and hook context.
 *
 * Route contract: {@link ../route/types}.
 *
 * @module hooks/types
 */

import type { RedirectTarget } from '../guard.types';
import type { RouteLifecycleContext } from '../route/types';

export type { LifecyclePhase, RouteHookAttrProp, RoutePhase } from '../route/types';

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
 */
export type HookResultInput = HookResult | boolean | RedirectTarget;

export type RouteHookFn<TOptions = Record<string, unknown>> = (
  ctx: RouteHookContext<TOptions>,
) => HookResultInput | Promise<HookResultInput>;

/**
 * Registered route hook — global by name, invoked when a route references it.
 */
export interface RouteHookDefinition<TOptions = Record<string, unknown>> {
  /** Identifier for route phase attrs — Unicode letters (no uppercase), digits, hyphens. */
  name: string;
  /** Hook semver (logged on replacement). */
  version: string;
  fn: RouteHookFn<TOptions>;
  /** Router API semver range; {@link ./registry!HookRegistry.register} throws when not satisfied. */
  requires?: string;
}

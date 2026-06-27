/**
 * Author-time helper for {@link RouteHookDefinition}.
 *
 * Validates hook name format and returns a frozen definition for `AuraRouter.use()`.
 *
 * @module hooks/define-hook
 */

import type { RouteHookDefinition } from './types';

/**
 * Declares a reusable route hook.
 *
 * @param def - hook name, version, fn, optional `requires` semver range
 * @returns frozen definition safe to pass to {@link AuraRouter.use}
 *
 * @example
 * ```ts
 * type AuthOptions = { redirect?: string };
 *
 * export const authHook = defineRouteHook<AuthOptions>({
 *   name: 'auth',
 *   version: '1.0.0',
 *   requires: '>=0.1.0',
 *   fn: async (ctx) => {
 *     if (!isLoggedIn()) return ctx.options.redirect ?? '/login';
 *   },
 * });
 * ```
 */
export function defineRouteHook<TOptions = Record<string, unknown>>(
  def: RouteHookDefinition<TOptions>,
): Readonly<RouteHookDefinition<TOptions>> {
  if (!def.name || !/^[a-z][a-z0-9-]*$/.test(def.name)) {
    throw new Error(`Invalid hook name: "${def.name}"`);
  }
  return Object.freeze({ ...def, fn: def.fn });
}

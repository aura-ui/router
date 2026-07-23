/**
 * Author-time helper for {@link RouteHookDefinition}.
 *
 * Freezes a hook definition for reuse / export. Name format is checked on
 * {@link HookRegistry.register} / `AuraRouter.use()`.
 *
 * @module hooks/define-hook
 */

import type { RouteHookDefinition } from './types';

/**
 * Declares a reusable route hook.
 *
 * @param def - hook name, version, fn, optional `requires` semver range
 * @returns frozen definition for `AuraRouter.use()`
 *
 * @example
 * ```ts
 * export const authHook = defineRouteHook({
 *   name: 'auth',
 *   version: '1.0.0',
 *   fn: async (ctx) => {
 *     if (!isLoggedIn()) return '/login';
 *   },
 * });
 * ```
 */
export function defineRouteHook<TOptions = Record<string, unknown>>(
  def: RouteHookDefinition<TOptions>,
): Readonly<RouteHookDefinition<TOptions>> {
  return Object.freeze({ ...def });
}

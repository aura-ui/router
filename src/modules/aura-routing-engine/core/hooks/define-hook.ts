/**
 * Author-time helper for {@link RouteHookDefinition}.
 *
 * Freezes a hook definition for reuse / export. Name format is checked on
 * {@link HookRegistry.register} / `AuraRouter.use()`.
 *
 * @module hooks/define-hook
 */

import type { RouteHookDefinition, RouteHookFn } from './types';

/** Optional fields for the short `defineRouteHook(name, fn, meta?)` form. */
export type DefineRouteHookMeta = Pick<Partial<RouteHookDefinition>, 'version' | 'requires'>;

/**
 * Declares a reusable route hook.
 *
 * @returns frozen definition for `AuraRouter.use()`
 *
 * @example
 * ```ts
 * export const auth = defineRouteHook('auth', async (ctx) => {
 *   if (!isLoggedIn()) return '/login';
 * });
 *
 * export const authHook = defineRouteHook({
 *   name: 'auth',
 *   version: '1.0.0',
 *   fn: async (ctx) => {
 *     if (!isLoggedIn()) return '/login';
 *   },
 * });
 * ```
 */
export function defineRouteHook<TOptions = Record<string, unknown>>(name: string, fn: RouteHookFn<TOptions>, meta?: DefineRouteHookMeta): Readonly<RouteHookDefinition<TOptions>>;
export function defineRouteHook<TOptions = Record<string, unknown>>(def: RouteHookDefinition<TOptions>): Readonly<RouteHookDefinition<TOptions>>;
export function defineRouteHook<TOptions = Record<string, unknown>>(nameOrDef: string | RouteHookDefinition<TOptions>, fn?: RouteHookFn<TOptions>, meta?: DefineRouteHookMeta): Readonly<RouteHookDefinition<TOptions>> {
  if (typeof nameOrDef !== 'string') return Object.freeze({ ...nameOrDef });
  const def: RouteHookDefinition<TOptions> = {
    name: nameOrDef,
    version: meta?.version ?? '1.0.0',
    fn: fn as RouteHookFn<TOptions>,
  };
  if (meta?.requires !== undefined) def.requires = meta.requires;
  return Object.freeze(def);
}

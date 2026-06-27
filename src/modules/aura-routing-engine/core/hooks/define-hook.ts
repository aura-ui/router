import type { RouteHookDefinition } from './types';

export function defineRouteHook<TOptions = Record<string, unknown>>(
  def: RouteHookDefinition<TOptions>,
): Readonly<RouteHookDefinition<TOptions>> {
  if (!def.name || !/^[a-z][a-z0-9-]*$/.test(def.name)) {
    throw new Error(`Invalid hook name: "${def.name}"`);
  }
  return Object.freeze({ ...def, fn: def.fn });
}

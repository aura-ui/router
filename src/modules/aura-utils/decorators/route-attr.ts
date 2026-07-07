import { attr, type AttrConfig } from './attr';

/**
 * Route-oriented `@attr` preset: `inherit: true` and `cached: true` by default.
 *
 * Pass `inherit: false` or `cached: false` to opt out. Cache invalidation uses {@link routeAttr.clear}
 * (alias of {@link attr.clear}).
 *
 * @example
 * ```ts
 * class AuraRoute extends HTMLElement {
 *   @routeAttr({ parser: parseCommaSeparated })
 *   guard!: string[] | null;
 *
 *   @routeAttr({ readonly: true, parser: parsePrefetchAttr })
 *   prefetch!: PrefetchType | false | null;
 *
 *   @routeAttr({ inherit: false, cached: true, readonly: true })
 *   path!: string;
 * }
 * ```
 */
export const routeAttr = <T = string>(config: AttrConfig<T> = {}) =>
  attr({ inherit: true, cached: true, readonly: true, ...config });

/** @see attr.clear */
routeAttr.clear = attr.clear;

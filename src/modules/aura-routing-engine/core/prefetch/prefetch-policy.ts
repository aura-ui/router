import {
  DEFAULT_ROUTER_PREFETCH_MODE,
  parsePrefetchAttr,
  type PrefetchType,
} from '../../../aura-route/core/attr/prefetchAtrrParser';
import type { RouteInstance } from '../route/types';
import type { PrefetchConfig, PrefetchMode } from './types';

export { DEFAULT_ROUTER_PREFETCH_MODE };

/** Parsed `prefetch` / `data-prefetch`: a mode, or `false` to disable. */
export type RouterPrefetchPolicy = false | PrefetchMode;

/** Maps parsed router/route attr to engine prefetch config. */
export function resolvePrefetchEngineConfig(
  parsed: PrefetchType | false | null | undefined,
): false | PrefetchConfig | undefined {
  if (parsed === false) return false;
  if (parsed == null) return undefined;
  return { defaultMode: parsed };
}

/** `<a data-prefetch>`. `undefined` = attr absent (fall through to route / router). */
export function readLinkPrefetchOverride(anchor: Element): RouterPrefetchPolicy | undefined {
  if (!anchor.hasAttribute('data-prefetch')) return undefined;
  return parsePrefetchAttr(anchor.getAttribute('data-prefetch') ?? '') ?? undefined;
}

/**
 * Prefetch mode for a link intent.
 *
 * Cascade: link `data-prefetch` → matched route `prefetch` → router default.
 * Touch with no explicit policy defaults to `tap`.
 */
export function resolvePrefetchMode(options: {
  anchor: Element;
  route?: RouteInstance | null;
  routerDefault?: PrefetchMode;
  touch?: boolean;
}): PrefetchMode | null {
  const routerDefault = options.routerDefault ?? DEFAULT_ROUTER_PREFETCH_MODE;

  const link = readLinkPrefetchOverride(options.anchor);
  if (link !== undefined) return link === false ? null : link;

  const route = options.route?.prefetch;
  if (route === false) return null;
  if (route != null) return route;

  return options.touch ? 'tap' : routerDefault;
}

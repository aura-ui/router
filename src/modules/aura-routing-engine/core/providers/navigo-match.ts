import type { Match } from 'navigo';

import type { RouteMatch } from '../types';

/** Navigo leave hooks may pass a single match or an array. */
export function firstMatch(arg: Match | Match[] | undefined): Match | null {
  if (!arg) return null;
  return Array.isArray(arg) ? arg[0] ?? null : arg;
}

export function matchPattern(match: Match | null, fallback: string): string {
  const routePath = match?.route?.path;
  return typeof routePath === 'string' ? routePath : fallback;
}

/**
 * Convert a Navigo {@link Match} to a provider-agnostic {@link RouteMatch}.
 *
 * Navigo naming (differs from aura-ui-router):
 * - `match.data` — path segment params (`/user/:id` → `{ id: '42' }`)
 * - `match.params` — query string params (`?tab=settings` → `{ tab: 'settings' }`)
 */
export function toRouteMatch(match: Match | null | undefined, pattern: string): RouteMatch | null {
  if (!match) return null;

  const params = match.data ?? undefined;
  const query = match.params ?? undefined;
  const path = match.url || (typeof match.route?.path === 'string' ? match.route.path : pattern);

  return {
    path,
    pattern,
    ...(params && { params: { ...params } }),
    ...(query && { query: { ...query } }),
  };
}

export function currentLocationUrl(): string {
  return window.location.pathname + window.location.search;
}

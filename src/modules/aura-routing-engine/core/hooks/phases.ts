/**
 * Phase metadata and hook name resolution for routes.
 *
 * Pipeline policy (branch, blocking/postCommit) is derived from
 * {@link ../processor/lifecycle-step!LIFECYCLE_STEPS}.
 * This module adds HTML/route attr bindings and parsing helpers.
 *
 * @module hooks/phases
 */

import { LIFECYCLE_STEPS, lifecycleStepPolicy } from '../processor/lifecycle-step';
import type {
  PhaseDefinition,
  PhaseHooksMap,
  RouteHookNamesSource,
  RoutePhase,
} from './types';

/**
 * Per-phase hook metadata: pipeline policy + how attrs map to route props.
 *
 * @see {@link NAVIGATION_PHASES.error} — terminal phase, not in {@link LIFECYCLE_STEPS}
 */
export const NAVIGATION_PHASES = {
  leave: {
    ...lifecycleStepPolicy(LIFECYCLE_STEPS.leave),
    htmlAttr: 'leave',
    routeProp: 'leave',
  },
  enter: {
    ...lifecycleStepPolicy(LIFECYCLE_STEPS.enter),
    htmlAttr: 'enter',
    routeProp: 'enter',
  },
  load: {
    ...lifecycleStepPolicy(LIFECYCLE_STEPS.load),
    htmlAttr: 'load',
    routeProp: 'load',
  },
  reenter: {
    ...lifecycleStepPolicy(LIFECYCLE_STEPS.reenter),
    htmlAttr: 'reenter',
  },
  transitionOut: {
    ...lifecycleStepPolicy(LIFECYCLE_STEPS.transitionOut),
    htmlAttr: 'transition-out',
    routeProp: 'transitionOut',
  },
  transitionIn: {
    ...lifecycleStepPolicy(LIFECYCLE_STEPS.transitionIn),
    htmlAttr: 'transition-in',
    routeProp: 'transitionIn',
  },
  left: {
    ...lifecycleStepPolicy(LIFECYCLE_STEPS.left),
    htmlAttr: 'left',
  },
  after: {
    ...lifecycleStepPolicy(LIFECYCLE_STEPS.after),
    htmlAttr: 'after',
    routeProp: 'afterHook',
  },
  error: {
    lifecyclePhase: 'error',
    branch: 'enterRoutes',
    hooks: { kind: 'postCommit', hookErrors: 'log' },
    onThrow: 'log',
    htmlAttr: 'error',
    routeProp: 'error',
  },
} as const satisfies Record<RoutePhase, PhaseDefinition>;

/**
 * Maps phase names in `hooks="phase::name"` to {@link RoutePhase}.
 * Includes camelCase keys and kebab-case {@link PhaseDefinition.htmlAttr} aliases.
 */
export const PHASE_HTML_ALIAS = Object.fromEntries(
  Object.entries(NAVIGATION_PHASES).flatMap(([phase, def]) => {
    const entries: [string, RoutePhase][] = [[phase, phase as RoutePhase]];
    if (def.htmlAttr && def.htmlAttr !== phase) {
      entries.push([def.htmlAttr, phase as RoutePhase]);
    }
    return entries;
  }),
) as Record<string, RoutePhase>;

/**
 * Parses the `hooks` attr on `<aura-route>`.
 *
 * @param raw - attr value or `null` when absent
 * @returns grouped hook names by phase, or `null` when empty/invalid
 *
 * @example
 * ```ts
 * parsePhaseHooks('enter::auth, after::analytics, transition-in::fade');
 * // → { enter: ['auth'], after: ['analytics'], transitionIn: ['fade'] }
 * ```
 */
export function parsePhaseHooks(raw: string | null): PhaseHooksMap | null {
  if (!raw?.trim()) return null;

  const map: PhaseHooksMap = {};

  for (const item of raw.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) continue;

    const sep = trimmed.indexOf('::');
    if (sep <= 0) continue;

    const phase = PHASE_HTML_ALIAS[trimmed.slice(0, sep).trim()];
    const name = trimmed.slice(sep + 2).trim();
    if (!phase || !name) continue;

    (map[phase] ??= []).push(name);
  }

  return Object.keys(map).length > 0 ? map : null;
}

/**
 * Resolves registered hook names for a phase on a route.
 *
 * Order: dedicated phase attr first, then entries from `hooks="phase::name"`.
 *
 * @example
 * ```ts
 * // route: enter="auth" hooks="enter::audit, after::analytics"
 * resolveHookNames(route, 'enter'); // → ['auth', 'audit']
 * resolveHookNames(route, 'after'); // → ['analytics'] (after attr or hooks map)
 * resolveHookNames(route, 'left');  // → hooks map only, e.g. hooks="left::cleanup"
 * ```
 */
export function resolveHookNames(
  source: RouteHookNamesSource,
  phase: RoutePhase,
): readonly string[] | null {
  const def = NAVIGATION_PHASES[phase];
  const routeProp = 'routeProp' in def ? def.routeProp : undefined;
  const fromAttr = routeProp ? source[routeProp] : null;
  const fromHooks = source.hooks?.[phase];
  const merged = [...(fromAttr ?? []), ...(fromHooks ?? [])];
  return merged.length > 0 ? merged : null;
}

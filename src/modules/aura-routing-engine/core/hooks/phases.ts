/**
 * Phase metadata and hook name resolution for routes.
 *
 * Pipeline policy (branch, blocking/postCommit) is derived from
 * {@link ./lifecycle-policy!PHASE_SPEC}.
 * This module adds HTML/route attr bindings and parsing helpers.
 *
 * @module hooks/phases
 */

import {
  PHASE_SPEC,
  phaseSpecPolicy,
  phaseSpecToHookHandling,
} from './lifecycle-policy';
import type {
  LifecyclePhase,
  PhaseDefinition,
  PhaseHooksMap,
  RouteHookAttrProp,
  RouteHookNamesSource,
  RoutePhase,
} from './types';

function phaseDefinitionFromSpec(
  spec: (typeof PHASE_SPEC)[LifecyclePhase],
  bindings: { htmlAttr?: string; routeProp?: RouteHookAttrProp } = {},
): PhaseDefinition {
  const policy = phaseSpecPolicy(spec);
  return {
    lifecyclePhase: policy.lifecyclePhase,
    branch: policy.branch,
    hooks: phaseSpecToHookHandling(spec),
    onThrow: policy.onThrow,
    ...bindings,
  };
}

/**
 * Per-phase hook metadata: pipeline policy + how attrs map to route props.
 *
 * @see {@link NAVIGATION_PHASES.error} — terminal phase, not in {@link PHASE_SPEC}
 */
export const NAVIGATION_PHASES = {
  leave: phaseDefinitionFromSpec(PHASE_SPEC.leave, { htmlAttr: 'leave', routeProp: 'leave' }),
  enter: phaseDefinitionFromSpec(PHASE_SPEC.enter, { htmlAttr: 'enter', routeProp: 'enter' }),
  load: phaseDefinitionFromSpec(PHASE_SPEC.load, { htmlAttr: 'load', routeProp: 'load' }),
  reenter: phaseDefinitionFromSpec(PHASE_SPEC.reenter, { htmlAttr: 'reenter' }),
  transitionOut: phaseDefinitionFromSpec(PHASE_SPEC.transitionOut, {
    htmlAttr: 'transition-out',
    routeProp: 'transitionOut',
  }),
  transitionIn: phaseDefinitionFromSpec(PHASE_SPEC.transitionIn, {
    htmlAttr: 'transition-in',
    routeProp: 'transitionIn',
  }),
  left: phaseDefinitionFromSpec(PHASE_SPEC.left, { htmlAttr: 'left' }),
  after: phaseDefinitionFromSpec(PHASE_SPEC.after, { htmlAttr: 'after', routeProp: 'afterHook' }),
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

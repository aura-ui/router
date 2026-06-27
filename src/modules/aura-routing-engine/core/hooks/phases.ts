import { LIFECYCLE_STEPS, lifecycleStepPolicy, postCommit } from '../processor/lifecycle-step';
import type {
  PhaseDefinition,
  PhaseHooksMap,
  RouteHookNamesSource,
  RoutePhase,
} from './types';

/** Hook phases — {@link LIFECYCLE_STEPS} policy + HTML/route attr bindings. */
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
    hooks: postCommit('log'),
    failOnLifecycleError: false,
    htmlAttr: 'error',
    routeProp: 'error',
  },
} as const satisfies Record<RoutePhase, PhaseDefinition>;

/** kebab-case phase names in `hooks="phase::name"` → {@link RoutePhase}. */
export const PHASE_HTML_ALIAS = Object.fromEntries(
  Object.entries(NAVIGATION_PHASES).flatMap(([phase, def]) => {
    const entries: [string, RoutePhase][] = [[phase, phase as RoutePhase]];
    if (def.htmlAttr && def.htmlAttr !== phase) {
      entries.push([def.htmlAttr, phase as RoutePhase]);
    }
    return entries;
  }),
) as Record<string, RoutePhase>;

/** Parses `hooks="phase::hook-name, ..."`. */
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

/** Phase attr hooks first, then `hooks="phase::name"` entries. */
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

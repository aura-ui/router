import type { RouteInstance, RoutePhase, PhaseHooksMap } from './types';

export type { PhaseHooksMap };

const PHASE_ALIAS: Record<string, RoutePhase> = {
  enter: 'enter',
  leave: 'leave',
  load: 'load',
  after: 'after',
  left: 'left',
  reenter: 'reenter',
  error: 'error',
  'transition-in': 'transitionIn',
  'transition-out': 'transitionOut',
};

/** Parses `hooks="phase::hook-name, ..."` (kebab-case phase in HTML). */
export function parsePhaseHooks(raw: string | null): PhaseHooksMap | null {
  if (!raw?.trim()) return null;

  const map: PhaseHooksMap = {};

  for (const item of raw.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) continue;

    const sep = trimmed.indexOf('::');
    if (sep <= 0) continue;

    const phase = PHASE_ALIAS[trimmed.slice(0, sep).trim()];
    const name = trimmed.slice(sep + 2).trim();
    if (!phase || !name) continue;

    (map[phase] ??= []).push(name);
  }

  return Object.keys(map).length > 0 ? map : null;
}

/** Merges phase attr hooks with optional `hooks="phase::name"` map. */
export function routeHookNames(route: RouteInstance, phase: RoutePhase): string[] | null {
  const fromAttr = route[phase];
  const fromHooks = route.hooks?.[phase];
  const merged = [...(fromAttr ?? []), ...(fromHooks ?? [])];
  return merged.length > 0 ? merged : null;
}

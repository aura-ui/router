import { NO_TRANSITION, type RouteTransition } from '../../../aura-routing-engine/core/transition/route-transition';
import { parseCommaSeparated } from '../../../aura-utils/misc';
import {
  DEFAULT_TRANSITION_POLICY,
  type TransitionPolicy,
} from '../../../aura-routing-engine/core/transition/policy';

export { NO_TRANSITION, type RouteTransition };

export type TransitionShortcut = { in: string[]; out: string[] };

/** `fade` или `fade, slide` (out, in). `null` when unset or empty. */
export function parseTransitionShortcut(raw: string | null | undefined): TransitionShortcut | null {
  const parts = parseCommaSeparated(raw as string);
  if (!parts?.length) return null;
  if (parts.length === 1) return { in: parts, out: parts };
  return { out: [parts[0]!], in: [parts[1]!] };
}

function sideHooks(decl: string[] | null, shortcut?: string[]): string[] | null {
  const hooks = decl ?? shortcut;
  return hooks?.length ? hooks : null;
}

export function buildRouteTransition(parts: {
  optOut?: boolean;
  order: TransitionPolicy | null;
  shortcut: TransitionShortcut | null;
  inDecl: string[] | null;
  outDecl: string[] | null;
}): RouteTransition {
  if (parts.optOut) return NO_TRANSITION;

  const inHooks = sideHooks(parts.inDecl, parts.shortcut?.in);
  const outHooks = sideHooks(parts.outDecl, parts.shortcut?.out);

  if (!parts.order && !inHooks && !outHooks) return NO_TRANSITION;

  return { order: parts.order ?? DEFAULT_TRANSITION_POLICY, in: inHooks, out: outHooks };
}

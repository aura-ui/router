import { parseCommaSeparated } from '../../../aura-utils/misc/format';
import type { TransitionOrderType } from './transition-order-attr-parser';

/** Resolved view transition from route attrs. `order: null` — inactive package (replace mount, skip transition phases). */
export interface RouteTransitionType {
  order: TransitionOrderType | null;
  in: string[] | null;
  out: string[] | null;
}

export type TransitionShortcutType = { in: string[]; out: string[] };

export const NO_TRANSITION: RouteTransitionType = { order: null, in: null, out: null };

/** `fade` or `fade, slide` (out, in). `null` when unset or empty (`transition=""`). */
export function parseTransitionShortcutAttr(raw: string | null | undefined): TransitionShortcutType | null {
  const parts = parseCommaSeparated(raw as string);
  if (!parts?.length) return null;
  if (parts.length === 1) return { in: parts, out: parts };
  return { out: [parts[0]!], in: [parts[1]!] };
}
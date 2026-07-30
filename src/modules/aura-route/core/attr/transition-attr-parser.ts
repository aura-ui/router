import { parseCommaSeparated } from '../../../aura-utils/misc/format';

import { isOffKeyword } from './off-keyword';
import type { TransitionOrderType } from './transition-order-attr-parser';

/** Resolved view transition from route attrs. `order: null` — inactive package (replace mount, skip transition phases). */
export interface RouteTransitionType {
  order: TransitionOrderType | null;
  in: string[] | null;
  out: string[] | null;
}

export type TransitionShortcutType = { in: string[]; out: string[] };

export const NO_TRANSITION: RouteTransitionType = { order: null, in: null, out: null };

/** `fade` or `fade, slide` (out, in). `null` when unset, invalid, or inherit opt-out. */
export function parseTransitionShortcutAttr(raw: string | null | undefined): TransitionShortcutType | null {
  if (raw == null) return null;
  if (isOffKeyword(raw)) return null;

  const parts = parseCommaSeparated(raw);
  if (!parts?.length) return null;
  if (parts.length === 1) return { in: parts, out: parts };
  return { out: [parts[0]!], in: [parts[1]!] };
}
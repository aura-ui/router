import { parseCommaSeparated } from '../../../aura-utils/misc/format';
import type { TransitionOrderType } from './transition-order-attr-parser';

export interface RouteTransitionType {
  order: TransitionOrderType | null;
  in: string[] | null;
  out: string[] | null;
}

export type TransitionShortcutType = { in: string[]; out: string[] };

export const NO_TRANSITION: RouteTransitionType = { order: null, in: null, out: null };

export function parseTransitionShortcutAttr(raw: string | null | undefined): TransitionShortcutType | null {
  const parts = parseCommaSeparated(raw as string);
  if (!parts) return null;
  if (parts.length === 1) return { in: parts, out: parts };
  return { out: [parts[0]!], in: [parts[1]!] };
}
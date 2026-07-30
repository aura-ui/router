import { isOffKeyword } from './off-keyword';

export type TransitionOrderType = 'out-in' | 'in-out' | 'parallel';

export const DEFAULT_TRANSITION_ORDER: TransitionOrderType = 'parallel';

export function parseTransitionOrder(value: string | null): TransitionOrderType | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (isOffKeyword(trimmed)) return null;
  if (!(trimmed === 'out-in' || trimmed === 'in-out' || trimmed === 'parallel')) {
    console.warn('Invalid transition-order attribute value; expected out-in, in-out, or parallel');
    return null;
  }
  return trimmed as TransitionOrderType;
}
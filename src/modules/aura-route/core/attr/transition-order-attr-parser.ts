export type TransitionOrderType = 'out-in' | 'in-out' | 'parallel';

export const DEFAULT_TRANSITION_ORDER: TransitionOrderType = 'parallel';

/** Attr parser for `transition-order`. `null` when unset, empty, or invalid. */
export function parseTransitionOrder(value: string | null): TransitionOrderType | null {
  if (!value) return null;
  if (!(value === 'out-in' || value === 'in-out' || value === 'parallel')) {
    console.warn('Invalid transition-order attribute value; expected out-in, in-out, or parallel');
    return null;
  }
  return value as TransitionOrderType;
}
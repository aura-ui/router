export type TransitionOrderType = 'out-in' | 'in-out' | 'parallel';

export const DEFAULT_TRANSITION_ORDER: TransitionOrderType = 'parallel';

export function parseTransitionOrder(value: string | null): TransitionOrderType | null {
  if (!value) return null;
  if (!(value === 'out-in' || value === 'in-out' || value === 'parallel')) {
    console.warn('Invalid transition-order attribute value, should be ...');
    return null;
  }
  return value as TransitionOrderType;
}
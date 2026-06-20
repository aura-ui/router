/** Порядок exit/enter transition effects относительно render. */
export type TransitionPolicy = 'out-in' | 'in-out' | 'parallel';

export const DEFAULT_TRANSITION_POLICY: TransitionPolicy = 'out-in';

export function parseTransitionPolicy(value: string | null | undefined): TransitionPolicy {
  if (value === 'in-out' || value === 'parallel') return value;
  return DEFAULT_TRANSITION_POLICY;
}

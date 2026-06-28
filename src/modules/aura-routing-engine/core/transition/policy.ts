/** View transition effect order (out-in / in-out / parallel) relative to render — not route branch diff. */
export type TransitionPolicy = 'out-in' | 'in-out' | 'parallel';

export const DEFAULT_TRANSITION_POLICY: TransitionPolicy = 'parallel';

export function isTransitionPolicy(value: string): value is TransitionPolicy {
  return value === 'out-in' || value === 'in-out' || value === 'parallel';
}

/** Attr parser: `null` when unset or invalid. */
export function parseTransitionOrder(value: string | null | undefined): TransitionPolicy | null {
  return value != null && isTransitionPolicy(value) ? value : null;
}

export function parseTransitionPolicy(value: string | null | undefined): TransitionPolicy {
  return parseTransitionOrder(value) ?? DEFAULT_TRANSITION_POLICY;
}

import type { TransitionPolicy } from './policy';

/**
 * Resolved view transition package from route attrs (`transition`, `transition-order`, …).
 *
 * `order` is {@link TransitionPolicy} (view effect order), not branch diff
 * ({@link ../route-tree/transition-plan!TransitionMap}).
 */
export interface RouteTransition {
  /** `null` — inactive package (replace mount, skip transition phases). */
  order: TransitionPolicy | null;
  in: string[] | null;
  out: string[] | null;
}

export const NO_TRANSITION: RouteTransition = { order: null, in: null, out: null };

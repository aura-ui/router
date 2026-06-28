import type { TransitionPolicy } from './policy';

/** Resolved transition package from route attrs (`transition`, `transition-order`, …). */
export interface RouteTransition {
  /** `null` — inactive package (replace mount, skip transition phases). */
  order: TransitionPolicy | null;
  in: string[] | null;
  out: string[] | null;
}

export const NO_TRANSITION: RouteTransition = { order: null, in: null, out: null };

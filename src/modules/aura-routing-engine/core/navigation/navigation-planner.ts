import type { MatchedRouteInfo } from '../match/url-matcher';
import { isSameNavigationTarget } from '../route-tree/transition-plan';
import { hasReenterWork } from './reenter-work';

/** What {@link AuraRoutingEngine.navigateTo} should do before starting the processor. */
export type NavigationPlan =
  | { action: 'run' }
  | { action: 'noop'; reason: 'already-active' | 'duplicate-pending' }
  | { action: 'cancel-pending' };

export interface NavigationPlanInput {
  href: string;
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
}

/**
 * Decides whether a navigation request runs the processor, is ignored, or cancels
 * a different pending navigation (active link while another href is in flight).
 */
export class NavigationPlanner {
  private pendingHref: string | null = null;

  plan(input: NavigationPlanInput): NavigationPlan {
    if (input.href === this.pendingHref) {
      return { action: 'noop', reason: 'duplicate-pending' };
    }

    const sameCommittedTarget =
      !!input.from
      && isSameNavigationTarget(input.from, input.to)
      && !hasReenterWork(input.to);

    if (sameCommittedTarget) {
      if (this.pendingHref !== null && this.pendingHref !== input.href) {
        return { action: 'cancel-pending' };
      }
      return { action: 'noop', reason: 'already-active' };
    }

    return { action: 'run' };
  }

  /** Marks href as pending for the duration of {@link AuraRoutingEngine.navigateTo}. */
  markPending(href: string): void {
    this.pendingHref = href;
  }

  clearPending(href: string): void {
    if (this.pendingHref === href) {
      this.pendingHref = null;
    }
  }

  reset(): void {
    this.pendingHref = null;
  }
}

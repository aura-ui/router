import type { CompleteFailureDeps, NavigationHookErrorDetail } from '../failure';
import type { HistoryProviderLike } from '../history/history-policy';
import type { HistoryAction, NavigateHistoryOptions } from '../history/provider.types';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { AuraRoutingProcessor } from '../processor/processor';
import type { RouterInstance } from '../route/types';

import { applyCommitGate } from './commit-gate';
import {
  finalizeProcessorNavigation,
  type FinalizeNavigationEffects,
} from './finalize';
import { NavigationPlanner } from './navigation-planner';

export interface NavigationCoordinatorCallbacks {
  onNavigationCommitted?: (to: MatchedRouteInfo) => void;
  onNavigationHookError?: (detail: NavigationHookErrorDetail) => void;
  onRedirect: (url: string, replace: boolean) => void;
  scrollToHash?: (hash: string) => void;
  failureDeps: () => CompleteFailureDeps;
  applyEffects: (effects: FinalizeNavigationEffects) => void;
}

export interface NavigationCoordinatorDeps {
  processor: AuraRoutingProcessor;
  router: RouterInstance;
  provider: HistoryProviderLike;
  callbacks: NavigationCoordinatorCallbacks;
}

export interface MatchedNavigationInput {
  from: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action: HistoryAction;
  href: string;
  hash: string;
  options: NavigateHistoryOptions;
}

/**
 * Coordinates a matched navigation after URL resolution.
 *
 * The engine owns I/O (history provider, link tracking, route registry). This
 * coordinator owns navigation dedupe, commit gate side effects, and terminal
 * processor outcomes.
 */
export class NavigationCoordinator {
  private readonly processor: AuraRoutingProcessor;
  private readonly router: RouterInstance;
  private readonly provider: HistoryProviderLike;
  private readonly callbacks: NavigationCoordinatorCallbacks;
  private readonly planner = new NavigationPlanner();

  constructor(deps: NavigationCoordinatorDeps) {
    this.processor = deps.processor;
    this.router = deps.router;
    this.provider = deps.provider;
    this.callbacks = deps.callbacks;
  }

  async run(input: MatchedNavigationInput): Promise<void> {
    const plan = this.planner.plan({
      href: input.href,
      from: input.from,
      to: input.to,
    });

    if (plan.action === 'noop') return;

    if (plan.action === 'cancel-pending') {
      this.processor.abortPendingNavigation();
      return;
    }

    this.planner.markPending(input.href);
    try {
      const result = await this.processor.run({
        from: input.from,
        to: input.to,
        action: input.action,
        router: this.router,
        reportHookError: (hookError, parent) => {
          this.callbacks.onNavigationHookError?.({
            error: hookError,
            phase: 'error',
            parent,
          });
        },
        commitGate: () => {
          this.callbacks.applyEffects(
            applyCommitGate({
              from: input.from,
              to: input.to,
              action: input.action,
              href: input.href,
              hash: input.hash,
              options: input.options,
              provider: this.provider,
              onNavigationCommitted: this.callbacks.onNavigationCommitted,
              scrollToHash: this.callbacks.scrollToHash,
            }),
          );
        },
      });

      this.callbacks.applyEffects(
        finalizeProcessorNavigation(
          result,
          input,
          this.provider,
          {
            failureDeps: this.callbacks.failureDeps(),
            onNavigationCommitted: this.callbacks.onNavigationCommitted,
            onRedirect: this.callbacks.onRedirect,
            scrollToHash: this.callbacks.scrollToHash,
          },
        ),
      );
    } finally {
      this.planner.clearPending(input.href);
    }
  }

  reset(): void {
    this.planner.reset();
  }
}

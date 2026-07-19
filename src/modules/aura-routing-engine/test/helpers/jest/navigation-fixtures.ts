import { AuraOutlet } from '../../../../aura-outlet/core/aura-outlet';
import type { RouteTransitionType } from '../../../../aura-route/core/attr/transition-attr-parser';
import type { AuraRoutingEngine } from '../../../core/aura-routing-engine';
import { NavigationFailure, NavigationError } from '../../../core/failure';
import { HookRegistry } from '../../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../../core/match/url-matcher';
import { NavigationTransaction } from '../../../core/navigation/navigation-transaction';
import type { NavigationLifecycleContext, NavigationTransactionOptions, TransactionResult } from '../../../core/navigation/types';
import { finalizeTransitionPlan } from '../../../core/route-tree/transition-plan';
import { ViewCommitTracker } from '../../../core/view-mount/view-commit-tracker';
import { createMockEngine } from '../create-mock-transaction';
import { createMockNavigationJob } from '../mock-navigation-job';

import { DEFAULT_PUSH_NAV_OPTIONS } from './constants';

export { DEFAULT_PUSH_NAV_OPTIONS } from './constants';

/** Simple parallel transition used in unit pipeline tests. */
export const PARALLEL_FADE_TRANSITION = {
  order: 'parallel' as const,
  in: ['fade'],
  out: ['fade'],
};

/** Parallel transition with distinct in/out hook names for integration tests. */
export const PARALLEL_CROSS_FADE_TRANSITION: RouteTransitionType = {
  order: 'parallel',
  in: ['fade-in'],
  out: ['fade-out'],
};

export function registerTestHook(
  registry: HookRegistry,
  name: string,
  fn: () => unknown | Promise<unknown>,
): void {
  registry.register({
    name,
    version: '1.0.0',
    fn: async () => fn() as never,
  });
}

export function createPushNavOptions(
  input: Pick<NavigationTransactionOptions, 'from' | 'to' | 'href'>,
): NavigationTransactionOptions {
  return {
    action: 'push',
    hash: '',
    options: DEFAULT_PUSH_NAV_OPTIONS,
    ...input,
  };
}

export function createNavigationLifecycleContext(
  matchedRoute: MatchedRouteInfo,
  overrides: Partial<NavigationLifecycleContext> = {},
): NavigationLifecycleContext {
  const job = createMockNavigationJob(1);
  return {
    transaction: {
      from: null,
      to: matchedRoute,
      action: 'push',
      plan: finalizeTransitionPlan({
        exitRoutes: [],
        enterRoutes: [matchedRoute],
        lca: null,
        update: false,
      }),
    },
    transactionId: job.transactionId,
    transactionSignal: job.transactionSignal,
    router: { navigate: jest.fn() },
    hookRegistry: new HookRegistry(),
    viewCommitTracker: new ViewCommitTracker(matchedRoute.href),
    isJobActive: () => true,
    ...overrides,
  };
}

export function createNavigationFailure(
  matchedRoute: MatchedRouteInfo,
  context: NavigationLifecycleContext,
  phase: 'guard' | 'load' | 'render' = 'guard',
): NavigationFailure {
  const error = new NavigationError({
    code: phase === 'load' ? 'LOAD_FAILED' : phase === 'render' ? 'RENDER_FAILED' : 'GUARD_THROW',
    phase,
    routePattern: matchedRoute.pattern,
    message: `${phase} failed`,
  });
  return NavigationFailure.fromPipeline(
    error,
    context.viewCommitTracker.snapshot,
    context.transaction.from,
    context.transaction.to,
    context.transaction.action,
  );
}

export async function runNavigationTransaction(
  from: MatchedRouteInfo,
  to: MatchedRouteInfo,
  engine: AuraRoutingEngine = createMockEngine(),
) {
  const transaction = new NavigationTransaction(
    1,
    {
      from,
      to,
      action: 'push',
      href: to.href,
      hash: '',
      options: DEFAULT_PUSH_NAV_OPTIONS,
    },
    () => false,
    engine,
  );

  return {
    result: await transaction.run(),
    engine,
    transaction,
  };
}

export function mockDeferredTransactionRun() {
  const resolvers: Array<(result: TransactionResult) => void> = [];

  const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(
    () =>
      new Promise<TransactionResult>((resolve) => {
        resolvers.push(resolve);
      }),
  );

  return {
    runSpy,
    resolveAt(index: number, result: TransactionResult) {
      resolvers[index](result);
    },
    pendingCount: () => resolvers.length,
  };
}

export function createTestOutlet(): AuraOutlet {
  const outlet = document.createElement(AuraOutlet.is) as AuraOutlet;
  document.body.append(outlet);
  return outlet;
}

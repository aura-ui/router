import type { ViewGraph, RouteInstance } from '../../core';
import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { DataGraph } from '../../core/data-graph';
import { HookRegistry } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import { DEFAULT_PUSH_NAV_OPTIONS } from './jest/constants';
import { createTestRoute } from './create-test-route';

export function createMatchedRoute(
  path: string,
  overrides: Partial<RouteInstance> = {},
): MatchedRouteInfo {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, overrides) as MatchedRouteInfo['route'],
  };
}

export function createMockEngine(): AuraRoutingEngine {
  const hookRegistry = new HookRegistry();
  return {
    commitHistoryIfNeeded: jest.fn(),
    commitNavigation: jest.fn(),
    finalizeCancelled: jest.fn(),
    dataGraph: new DataGraph(hookRegistry),
    hooksRegistry: hookRegistry,
    router: { navigate: jest.fn() },
    viewGraph: { loadView: jest.fn().mockResolvedValue(null) } as unknown as ViewGraph,
  } as unknown as AuraRoutingEngine;
}

export function createCoordinatorMockEngine(): AuraRoutingEngine {
  const hookRegistry = new HookRegistry();
  return {
    isRunning: true,
    commitNavigation: jest.fn(),
    finalizeCancelled: jest.fn(),
    applyRedirect: jest.fn(),
    finalizeError: jest.fn(),
    dataGraph: new DataGraph(hookRegistry),
    hooksRegistry: hookRegistry,
    router: { navigate: jest.fn() },
    reportNavigationHookError: jest.fn(),
  } as unknown as AuraRoutingEngine;
}

export function createPairTransaction(options: {
  from: MatchedRouteInfo;
  to: MatchedRouteInfo;
  isTransactionStale?: () => boolean;
  transitionOrder?: TransitionOrderType | null;
}): NavigationTransaction {
  const engine = createCoordinatorMockEngine();
  const transaction = new NavigationTransaction(
    1,
    0,
    {
      from: options.from,
      to: options.to,
      action: 'push',
      href: options.to.href,
      hash: '',
      options: DEFAULT_PUSH_NAV_OPTIONS,
    },
    () => options.isTransactionStale?.() ?? false,
    engine,
  );

  transaction.transitionPlan = {
    exitRoutes: [options.from],
    enterRoutes: [options.to],
    lca: null,
    update: false,
  };
  transaction.transitionOrder = options.transitionOrder ?? 'parallel';

  return transaction;
}

export function createMockTransaction(options: {
  from?: MatchedRouteInfo | null;
  exitRoutes?: MatchedRouteInfo[];
  enterRoutes?: MatchedRouteInfo[];
  transitionOrder?: TransitionOrderType | null;
  update?: boolean;
  isTransactionStale?: () => boolean;
}): NavigationTransaction {
  const enterRoutes = options.enterRoutes ?? [createMatchedRoute('/to')];
  const from = options.from ?? null;
  const to = enterRoutes[enterRoutes.length - 1]!;
  const engine = createMockEngine();

  const transaction = new NavigationTransaction(
    1,
    0,
    {
      from,
      to,
      action: 'push',
      href: to.href,
      hash: '',
      options: DEFAULT_PUSH_NAV_OPTIONS,
    },
    () => options.isTransactionStale?.() ?? false,
    engine,
  );

  transaction.transitionPlan = {
    exitRoutes: options.exitRoutes ?? (from ? [from] : []),
    enterRoutes,
    lca: null,
    update: options.update ?? false,
  };
  transaction.transitionOrder =
    options.transitionOrder === undefined ? 'parallel' : options.transitionOrder;

  return transaction;
}

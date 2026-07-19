import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import type { ViewGraph, RouteInstance } from '../../core';
import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { DataGraph } from '../../core/data-graph';
import { EventBus } from '../../core/events';
import { HookRegistry } from '../../core/hooks/registry';
import { resourceKeys } from '../../core/match/resource-keys';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { NavigationHost } from '../../core/navigation/navigation-host';
import { NavigationPulse } from '../../core/navigation/navigation-pulse';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { HandoffCache, ResourceGraph } from '../../core/resource-graph';
import {
  finalizeTransitionPlan,
  type TransitionMap,
} from '../../core/route-tree/transition-plan';

import { createTestRoute } from './create-test-route';
import { DEFAULT_PUSH_NAV_OPTIONS } from './jest/constants';

export function createMatchedRoute(
  path: string,
  overrides: Partial<RouteInstance> = {},
): MatchedRouteInfo {
  const info: MatchedRouteInfo = {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, overrides) as MatchedRouteInfo['route'],
  };
  const keys = resourceKeys(info);
  info.dataKey = keys.dataKey;
  info.viewKey = keys.viewKey;
  return info;
}

/** Test helper: override plan `transitionOrder` without rebuilding route attrs. */
export function withPlanTransitionOrder(
  plan: TransitionMap,
  transitionOrder: TransitionOrderType | null,
): TransitionMap {
  return { ...plan, transitionOrder };
}

/** Batch `load` that fans out to `loadView` (ResourceGraph entry). */
export function createViewGraphFromLoadView(
  loadView: ViewGraph['loadView'],
): ViewGraph {
  return {
    loadView,
    hasCachedView: jest.fn().mockReturnValue(false),
    destroy: jest.fn(),
    invalidate: jest.fn().mockReturnValue(0),
    load: jest.fn(async (matches: readonly MatchedRouteInfo[], signal: AbortSignal, options?: unknown) => {
      const results = await Promise.all(
        matches.map((match) => loadView(match, signal, options as never)),
      );
      const error = results.find((result) => result?.error)?.error;
      return error ? { error } : { data: results };
    }),
  } as unknown as ViewGraph;
}

/** Minimal ViewGraph for ResourceGraph.load in pipeline tests. */
export function createMockViewGraph(): ViewGraph {
  return createViewGraphFromLoadView(
    jest.fn(async (match: MatchedRouteInfo) => {
      const layout =
        typeof match.route.layout === 'string' ? match.route.layout.trim() : '';
      return { data: layout || match.route.view?.content ?? null };
    }),
  );
}

function createTestResourceGraph(options: {
  hooks: HookRegistry;
  viewGraph?: ViewGraph;
  dataGraph?: DataGraph;
  sharedBuffer?: HandoffCache;
}): ResourceGraph {
  const sharedBuffer = options.sharedBuffer ?? new HandoffCache();
  const dataGraph =
    options.dataGraph ?? new DataGraph(sharedBuffer, { hooks: options.hooks });
  const viewGraph = options.viewGraph ?? createMockViewGraph();
  return new ResourceGraph({
    hooks: options.hooks,
    sharedBuffer,
    dataGraph,
    viewGraph,
  });
}

/** Point engine.resourceGraph at a ResourceGraph that uses the given ViewGraph. */
export function wireEngineViewGraph(
  engine: AuraRoutingEngine,
  viewGraph: ViewGraph,
): void {
  const { dataGraph, sharedBuffer } = engine.resourceGraph;
  (engine as { resourceGraph: ResourceGraph }).resourceGraph = new ResourceGraph({
    hooks: engine.hooksRegistry,
    viewGraph,
    dataGraph,
    sharedBuffer,
  });
}

export function createMockEngine(): AuraRoutingEngine {
  const hookRegistry = new HookRegistry();
  const events = new EventBus();
  const engine = {
    events,
    pulse: new NavigationPulse(events),
    commitHistoryIfNeeded: jest.fn(),
    notifyUrlAligned: jest.fn(),
    commitNavigation: jest.fn(),
    applyTerminalOutcome: jest.fn(),
    resourceGraph: createTestResourceGraph({ hooks: hookRegistry }),
    get dataGraph() {
      return this.resourceGraph.dataGraph;
    },
    get viewGraph() {
      return this.resourceGraph.viewGraph;
    },
    hooksRegistry: hookRegistry,
    router: { navigate: jest.fn() },
  };
  return engine as unknown as AuraRoutingEngine;
}

export function createCoordinatorMockHost(): NavigationHost & {
  applyTerminalOutcome: jest.Mock;
} {
  const hookRegistry = new HookRegistry();
  const events = new EventBus();
  const host = {
    isRunning: true,
    events,
    pulse: new NavigationPulse(events),
    matcher: { matchPath: jest.fn(), buildMatchedRouteInfo: jest.fn() },
    getCommittedRoute: jest.fn().mockReturnValue(null),
    getMatchableNodes: jest.fn().mockReturnValue([]),
    commitPopSlashFix: jest.fn(),
    finalizeResolveTerminal: jest.fn(),
    handleUnmatchedNavigation: jest.fn(),
    handleRedirectError: jest.fn(),
    commitNavigation: jest.fn(),
    applyTerminalOutcome: jest.fn(),
    resourceGraph: createTestResourceGraph({ hooks: hookRegistry }),
    get dataGraph() {
      return this.resourceGraph.dataGraph;
    },
    get viewGraph() {
      return this.resourceGraph.viewGraph;
    },
    hooksRegistry: hookRegistry,
    router: { navigate: jest.fn() },
    reportNavigationHookError: jest.fn(),
    engine: null as unknown as AuraRoutingEngine,
  };
  host.engine = host as unknown as AuraRoutingEngine;
  return host as NavigationHost & {
    applyTerminalOutcome: jest.Mock;
  };
}

export function createPairTransaction(options: {
  from: MatchedRouteInfo;
  to: MatchedRouteInfo;
  isTransactionStale?: () => boolean;
  transitionOrder?: TransitionOrderType | null;
}): NavigationTransaction {
  const engine = createCoordinatorMockHost() as unknown as AuraRoutingEngine;
  const transaction = new NavigationTransaction(
    1,
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

  const plan = finalizeTransitionPlan({
    exitRoutes: [options.from],
    enterRoutes: [options.to],
    lca: null,
    update: false,
  });
  transaction.transitionPlan = withPlanTransitionOrder(
    plan,
    options.transitionOrder ?? 'parallel',
  );

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

  const plan = finalizeTransitionPlan({
    exitRoutes: options.exitRoutes ?? (from ? [from] : []),
    enterRoutes,
    lca: null,
    update: options.update ?? false,
  });
  transaction.transitionPlan = withPlanTransitionOrder(
    plan,
    options.transitionOrder === undefined ? 'parallel' : options.transitionOrder,
  );

  return transaction;
}

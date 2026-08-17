import type { TransitionOrderType } from '../../../aura-route/core/attr/transition-order-attr-parser';
import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import type { ViewGraph, RouteInstance, ViewPayload, ViewSnapshotEntry } from '../../core';
import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { DataGraph } from '../../core/data-graph';
import { EventBus } from '../../core/events';
import type {
  HistoryAction,
  NavigateHistoryOptions,
} from '../../core/history/provider.types';
import { HookRegistry } from '../../core/hooks/registry';
import { resourceKeys } from '../../core/match/resource-keys';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationPulse } from '../../core/navigation/navigation-pulse';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import type { NavigationTransactionOptions } from '../../core/navigation/types';
import { HandoffCache, ResourceGraph } from '../../core/resource-graph';
import {
  finalizeTransitionPlan,
  type TransitionMap,
} from '../../core/route-tree/transition-plan';

import { createTestRoute } from './create-test-route';
import { DEFAULT_PUSH_NAV_OPTIONS } from './jest/constants';
import { withResolvedView } from './with-resolved-view';

/** View snapshot entries for pipeline / ResourceGraph fixtures (`head` unset). */
export function asViewSnapshot(
  ...payloads: readonly (ViewPayload | null)[]
): ViewSnapshotEntry[] {
  return payloads.map((payload) => ({ payload, head: undefined }));
}

/** Match-level fields that may be mixed into the second arg of {@link createMatchedRoute}. */
type MatchedRouteFieldOverrides = Partial<
  Pick<
    MatchedRouteInfo,
    | 'href'
    | 'pathname'
    | 'search'
    | 'hash'
    | 'pattern'
    | 'params'
    | 'query'
    | 'node'
    | 'chain'
    | 'dataKey'
    | 'viewKey'
  >
>;

/** Fixture `resolvedView` — `viewKey` is filled as `${loader}:${content}` when omitted. */
export type ResolvedViewOverride = {
  loader: string;
  content: string;
  viewKey?: string;
} | null;

/** Runtime-only fields on test route stubs (not on {@link RouteInstance}). */
export type TestRouteRuntimeOverrides = {
  layout?: string;
  redirect?: string;
};

export type CreateMatchedRouteOverrides = Partial<RouteInstance> &
  TestRouteRuntimeOverrides &
  MatchedRouteFieldOverrides & {
    resolvedView?: ResolvedViewOverride;
    /** Use an existing route instance instead of {@link createTestRoute}. */
    asRoute?: MatchedRouteInfo['route'];
    /** Call {@link withResolvedView} after building the match. */
    attachResolvedView?: boolean;
  };

function normalizeResolvedViewOverride(
  value: ResolvedViewOverride | undefined,
): MatchedRouteInfo['resolvedView'] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return {
    loader: value.loader,
    content: value.content,
    viewKey: value.viewKey ?? `${value.loader}:${value.content}`,
  };
}

const MATCHED_ROUTE_OVERRIDE_KEYS = [
  'href',
  'pathname',
  'search',
  'hash',
  'pattern',
  'params',
  'query',
  'node',
  'chain',
  'resolvedView',
  'dataKey',
  'viewKey',
  'asRoute',
  'attachResolvedView',
] as const satisfies readonly (keyof CreateMatchedRouteOverrides)[];

export function createMatchedRoute(
  path: string,
  overrides: CreateMatchedRouteOverrides = {},
): MatchedRouteInfo {
  const matchOverrides: MatchedRouteFieldOverrides & {
    resolvedView?: MatchedRouteInfo['resolvedView'];
  } = {};
  const routeOverrides: Partial<RouteInstance> & TestRouteRuntimeOverrides = {};

  for (const [key, value] of Object.entries(overrides) as Array<
    [keyof CreateMatchedRouteOverrides, CreateMatchedRouteOverrides[keyof CreateMatchedRouteOverrides]]
  >) {
    if (value === undefined) continue;
    if ((MATCHED_ROUTE_OVERRIDE_KEYS as readonly string[]).includes(key)) {
      if (key === 'asRoute' || key === 'attachResolvedView') continue;
      if (key === 'resolvedView') {
        matchOverrides.resolvedView = normalizeResolvedViewOverride(
          value as ResolvedViewOverride,
        );
        continue;
      }
      (matchOverrides as Record<string, unknown>)[key] = value;
    } else {
      (routeOverrides as Record<string, unknown>)[key] = value;
    }
  }

  const info: MatchedRouteInfo = {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route:
      overrides.asRoute ??
      (createTestRoute(path, routeOverrides) as MatchedRouteInfo['route']),
    ...matchOverrides,
  };

  if (info.dataKey === undefined || info.viewKey === undefined) {
    const keys = resourceKeys(info);
    info.dataKey ??= keys.dataKey;
    info.viewKey ??= keys.viewKey;
  }

  return overrides.attachResolvedView ? withResolvedView(info) : info;
}

/**
 * ViewGraph unit-test match: `NO_CACHE`, optional `resolvedView` → view attrs,
 * then {@link withResolvedView}.
 *
 * Accepts either top-level {@link CreateMatchedRouteOverrides} fields or a nested
 * `route: Partial<RouteInstance>` bag (legacy call shape in view-graph tests).
 */
export function createViewGraphRoute(
  pattern: string,
  overrides: CreateMatchedRouteOverrides & {
    route?: Partial<RouteInstance> & TestRouteRuntimeOverrides;
  } = {},
): MatchedRouteInfo {
  const { route: routePartial, resolvedView, ...rest } = overrides;
  const viewFromResolved =
    resolvedView && typeof resolvedView === 'object' && 'loader' in resolvedView
      ? {
          loader: resolvedView.loader,
          content: resolvedView.content,
        }
      : undefined;

  return createMatchedRoute(pattern, {
    layout: '',
    cache: NO_CACHE,
    view: viewFromResolved ?? null,
    ...routePartial,
    ...rest,
    ...(resolvedView !== undefined ? { resolvedView } : {}),
    attachResolvedView: true,
  });
}

/** Matched route with default `load: ['data']` for DataGraph tests. */
export function createDataMatchedRoute(
  path: string,
  load: string[] | null = ['data'],
): MatchedRouteInfo {
  return createMatchedRoute(path, { load });
}

/** Navigation transaction wired for {@link DataGraph.load} calls. */
export function createDataGraphTransaction(
  hookRegistry: HookRegistry,
  enterRoutes: readonly MatchedRouteInfo[],
) {
  const to = enterRoutes[enterRoutes.length - 1]!;
  const engine = { ...createMockEngine(), hooksRegistry: hookRegistry } as AuraRoutingEngine;
  return createNavigationTransaction({
    engine,
    to,
    enterRoutes: [...enterRoutes],
    exitRoutes: [],
    transitionOrder: null,
  });
}

/** Navigation-mode options bag for {@link DataGraph.load}. */
export function createDataGraphLoadOptions(
  hookRegistry: HookRegistry,
  enterRoutes: readonly MatchedRouteInfo[],
  branch?: readonly MatchedRouteInfo[],
) {
  return {
    transaction: createDataGraphTransaction(hookRegistry, enterRoutes),
    mode: 'navigation' as const,
    ...(branch ? { branch } : {}),
  };
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
    getCachedHtmlHead: jest.fn().mockReturnValue(undefined),
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
      return { payload: layout || (match.route.view?.content ?? null) };
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

/** Partial engine stub for {@link NavigationCoordinator} unit tests. */
export function createCoordinatorMockEngine(): AuraRoutingEngine & {
  applyTerminalOutcome: jest.Mock;
} {
  const hookRegistry = new HookRegistry();
  const events = new EventBus();
  const engine = {
    isRunning: true,
    events,
    pulse: new NavigationPulse(events),
    matcher: { matchPath: jest.fn(), buildMatchedRouteInfo: jest.fn() },
    getCommittedRoute: jest.fn().mockReturnValue(null),
    getMatchableNodes: jest.fn().mockReturnValue([]),
    finalizeResolveTerminal: jest.fn(),
    handleUnmatchedNavigation: jest.fn(),
    handleRedirectError: jest.fn(),
    commitNavigation: jest.fn(),
    applyTerminalOutcome: jest.fn(),
    restoreCommittedNavState: jest.fn(),
    handleSameUrlNavigation: jest.fn(),
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
  };
  return engine as unknown as AuraRoutingEngine & {
    applyTerminalOutcome: jest.Mock;
  };
}

export type CreateNavigationTransactionOptions = {
  engine: AuraRoutingEngine;
  from?: MatchedRouteInfo | null;
  to: MatchedRouteInfo;
  action?: HistoryAction;
  href?: string;
  hash?: string;
  options?: NavigateHistoryOptions;
  id?: number;
  isStale?: () => boolean;
  skipBlockingPhases?: boolean;
  phaseMode?: NavigationTransactionOptions['phaseMode'];
  /** When set, assigns `transaction.transitionPlan`. */
  plan?: TransitionMap;
  exitRoutes?: MatchedRouteInfo[];
  enterRoutes?: MatchedRouteInfo[];
  transitionOrder?: TransitionOrderType | null;
  update?: boolean;
};

/** Real {@link NavigationTransaction} with common test defaults. */
export function createNavigationTransaction(
  options: CreateNavigationTransactionOptions,
): NavigationTransaction {
  const to = options.to;
  const from = options.from ?? null;
  const transaction = new NavigationTransaction(
    options.id ?? 1,
    {
      from,
      to,
      action: options.action ?? 'push',
      href: options.href ?? to.href,
      hash: options.hash ?? to.hash ?? '',
      options: options.options ?? DEFAULT_PUSH_NAV_OPTIONS,
      ...(options.skipBlockingPhases !== undefined
        ? { skipBlockingPhases: options.skipBlockingPhases }
        : {}),
      ...(options.phaseMode !== undefined ? { phaseMode: options.phaseMode } : {}),
    },
    () => options.isStale?.() ?? false,
    options.engine,
  );

  if (options.plan) {
    transaction.transitionPlan = options.plan;
  } else if (
    options.exitRoutes ||
    options.enterRoutes ||
    options.transitionOrder !== undefined ||
    options.update !== undefined
  ) {
    const plan = finalizeTransitionPlan({
      exitRoutes: options.exitRoutes ?? (from ? [from] : []),
      enterRoutes: options.enterRoutes ?? [to],
      lca: null,
      update: options.update ?? false,
    });
    transaction.transitionPlan = withPlanTransitionOrder(
      plan,
      options.transitionOrder === undefined ? 'parallel' : options.transitionOrder,
    );
  }

  return transaction;
}

export function createPairTransaction(options: {
  from: MatchedRouteInfo;
  to: MatchedRouteInfo;
  isTransactionStale?: () => boolean;
  transitionOrder?: TransitionOrderType | null;
}): NavigationTransaction {
  const engine = createCoordinatorMockEngine() as unknown as AuraRoutingEngine;
  return createNavigationTransaction({
    engine,
    from: options.from,
    to: options.to,
    isStale: options.isTransactionStale,
    exitRoutes: [options.from],
    enterRoutes: [options.to],
    transitionOrder: options.transitionOrder ?? 'parallel',
  });
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
  return createNavigationTransaction({
    engine: createMockEngine(),
    from,
    to,
    isStale: options.isTransactionStale,
    exitRoutes: options.exitRoutes ?? (from ? [from] : []),
    enterRoutes,
    transitionOrder:
      options.transitionOrder === undefined ? 'parallel' : options.transitionOrder,
    update: options.update ?? false,
  });
}

import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import type { LoaderFn } from '../../core';
import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { DataGraph } from '../../core/data-graph';
import type { RouteHookDefinition } from '../../core/hooks/types';
import { HookRegistry } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import type { NavigationPhaseMode } from '../../core/navigation/types';
import {
  HandoffCache,
  ResourceGraph,
  type ResourceGraphLoadPlan,
} from '../../core/resource-graph';
import { ViewGraph, type LoaderRegistry } from '../../core/view-graph';

import {
  createMatchedRoute,
  createMockEngine,
  createMockViewGraph,
  createNavigationTransaction,
  type CreateMatchedRouteOverrides,
} from './create-mock-transaction';
import { withResolvedView } from './with-resolved-view';

export type CreateResourceGraphOptions = {
  hooks?: HookRegistry;
  viewGraph?: ViewGraph;
  dataGraph?: DataGraph;
  sharedBuffer?: HandoffCache;
};

/** Minimal {@link ResourceGraph} for unit plan / load tests. */
export function createTestResourceGraph(
  options: CreateResourceGraphOptions = {},
): ResourceGraph {
  const hooks = options.hooks ?? new HookRegistry();
  const sharedBuffer = options.sharedBuffer ?? new HandoffCache();
  return new ResourceGraph({
    hooks,
    viewGraph: options.viewGraph ?? ({} as ViewGraph),
    dataGraph: options.dataGraph ?? ({} as DataGraph),
    sharedBuffer,
  });
}

/**
 * ResourceGraph with a real {@link DataGraph} sharing `handoff`
 * (pin / unpin interest tests).
 */
export function createPinnedResourceGraph(handoff: HandoffCache): ResourceGraph {
  const hooks = new HookRegistry();
  return new ResourceGraph({
    hooks,
    viewGraph: { loadView: jest.fn() } as unknown as ViewGraph,
    dataGraph: new DataGraph(handoff, { hooks }),
    sharedBuffer: handoff,
  });
}

/** Access private {@link ResourceGraph} `buildLoadPlan` in tests. */
export function buildResourceLoadPlan(
  graph: ResourceGraph,
  routes: readonly MatchedRouteInfo[],
): ResourceGraphLoadPlan {
  return (
    graph as unknown as {
      buildLoadPlan(routes: readonly MatchedRouteInfo[]): ResourceGraphLoadPlan;
    }
  ).buildLoadPlan(routes);
}

export type CreateResourceGraphRouteOptions = {
  load?: string[] | null;
  asyncView?: boolean;
  layout?: string;
  view?: MatchedRouteInfo['route']['view'];
};

/** Match fixture with html/url view presets for ResourceGraph plan tests. */
export function createResourceGraphRoute(
  path: string,
  options: CreateResourceGraphRouteOptions = {},
): MatchedRouteInfo {
  const { load = null, asyncView = false, layout = '', view } = options;
  return createMatchedRoute(path, {
    load,
    layout,
    view:
      view !== undefined
        ? view
        : asyncView
          ? { loader: 'url', content: `${path}.html` }
          : { loader: 'html', content: '<span/>' },
  });
}

/** Cast async data producers into the hook registry fn type. */
export function asLoadHook(fn: () => Promise<unknown>): RouteHookDefinition['fn'] {
  return fn as unknown as RouteHookDefinition['fn'];
}

/** Cast async HTML producers into {@link LoaderFn}. */
export function asHtmlLoader(fn: () => Promise<string>): LoaderFn {
  return fn as unknown as LoaderFn;
}

/** Navigation / prefetch transaction for ResourceGraph prepare pipelines. */
export function createResourcePrepareTransaction(
  enterRoutes: readonly MatchedRouteInfo[],
  engine: AuraRoutingEngine,
  phaseMode: NavigationPhaseMode,
  update = false,
): NavigationTransaction {
  const to = enterRoutes[enterRoutes.length - 1]!;
  return createNavigationTransaction({
    engine,
    to,
    phaseMode,
    enterRoutes: [...enterRoutes],
    exitRoutes: [],
    update,
    transitionOrder: null,
  });
}

/** No-cache html route with {@link withResolvedView} applied. */
export function createNoCacheResolvedRoute(
  path: string,
  overrides: CreateMatchedRouteOverrides = {},
): MatchedRouteInfo {
  return withResolvedView(
    createMatchedRoute(path, {
      view: { loader: 'html', content: `<span>${path}</span>` },
      cache: NO_CACHE,
      ...overrides,
    }),
  );
}

export type ResourceGraphStackOptions = {
  hooks?: HookRegistry;
  ttl?: number;
  viewRegistry?: LoaderRegistry;
};

export type ResourceGraphStack = {
  hooks: HookRegistry;
  handoff: HandoffCache;
  dataGraph: DataGraph;
  viewGraph: ViewGraph;
  resourceGraph: ResourceGraph;
  engine: AuraRoutingEngine;
};

/** Full ResourceGraph + engine stack for prepare-coherence integration tests. */
export function createResourceGraphStack(
  options: ResourceGraphStackOptions = {},
): ResourceGraphStack {
  const hooks = options.hooks ?? new HookRegistry();
  const handoff = new HandoffCache(
    options.ttl !== undefined ? { ttl: options.ttl } : undefined,
  );
  const dataGraph = new DataGraph(handoff, { hooks, cache: { staleTime: 60_000 } });
  const viewGraph = options.viewRegistry
    ? new ViewGraph(handoff, { registry: options.viewRegistry })
    : createMockViewGraph();
  const resourceGraph = new ResourceGraph({
    hooks,
    viewGraph,
    dataGraph,
    sharedBuffer: handoff,
  });
  const engine = createMockEngine();
  (engine as { resourceGraph: ResourceGraph }).resourceGraph = resourceGraph;
  (engine as { hooksRegistry: HookRegistry }).hooksRegistry = hooks;
  return { hooks, handoff, dataGraph, viewGraph, resourceGraph, engine };
}

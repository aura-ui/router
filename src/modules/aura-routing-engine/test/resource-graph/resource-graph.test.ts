import type { DataGraph } from '../../core/data-graph';
import { HookRegistry } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import {
  HandoffCache,
  ResourceGraph,
  type ResourceGraphLoadPlan,
} from '../../core/resource-graph';
import type { ViewGraph } from '../../core/view-graph';
import {
  createMatchedRoute,
  createViewGraphFromLoadView,
} from '../_helpers/create-mock-transaction';

function createGraph(viewGraph: ViewGraph, dataGraph: DataGraph): ResourceGraph {
  return new ResourceGraph({
    hooks: new HookRegistry(),
    viewGraph,
    dataGraph,
    sharedBuffer: new HandoffCache(),
  });
}

function buildLoadPlan(
  graph: ResourceGraph,
  routes: readonly MatchedRouteInfo[],
): ResourceGraphLoadPlan {
  return (
    graph as unknown as {
      buildLoadPlan(routes: readonly MatchedRouteInfo[]): ResourceGraphLoadPlan;
    }
  ).buildLoadPlan(routes);
}

function matchedRoute(
  path: string,
  options: {
    load?: string[] | null;
    asyncView?: boolean;
    layout?: string;
    view?: MatchedRouteInfo['route']['view'];
  } = {},
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

describe('ResourceGraph', () => {
  it('buildLoadPlan splits data routes and independent view routes', () => {
    const parent = matchedRoute('/app', { load: ['layout'] });
    const leaf = matchedRoute('/app/home', { load: ['page'], asyncView: true });
    const staticOnly = matchedRoute('/about', { asyncView: true });

    const graph = createGraph({} as ViewGraph, {} as DataGraph);
    const plan = buildLoadPlan(graph, [parent, leaf, staticOnly]);

    expect(plan.dataRoutes).toEqual([parent, leaf]);
    expect(plan.viewRoutes.map((r) => r.pattern)).toEqual([
      '/app',
      '/app/home',
      '/about',
    ]);
    expect(plan.viewWithDataRoutes).toEqual([]);
  });

  it('buildLoadPlan puts layout-only routes into viewRoutes', () => {
    const folder = matchedRoute('/settings', {
      load: ['settings-data'],
      layout: '<slot></slot>',
      view: null,
    });
    const leaf = matchedRoute('/settings/profile', { asyncView: true });

    const graph = createGraph({} as ViewGraph, {} as DataGraph);
    const plan = buildLoadPlan(graph, [folder, leaf]);

    expect(plan.dataRoutes).toEqual([folder]);
    expect(plan.viewRoutes.map((r) => r.pattern)).toEqual([
      '/settings',
      '/settings/profile',
    ]);
    expect(plan.viewWithDataRoutes).toEqual([]);
  });

  it('navigation load runs dataGraph.load once in parallel with views', async () => {
    const order: string[] = [];
    let releaseData!: () => void;
    const dataGate = new Promise<void>((resolve) => {
      releaseData = resolve;
    });

    const parent = matchedRoute('/app', { load: ['layout'] });
    const leaf = matchedRoute('/app/page', { load: ['page'], asyncView: true });
    const branch = [parent, leaf];

    const dataGraph = {
      load: jest.fn(async (routes: MatchedRouteInfo[]) => {
        order.push(`data-start:${routes.map((r) => r.pattern).join(',')}`);
        await dataGate;
        order.push('data-done');
        return { data: new Map([['k', { ok: true }]]) };
      }),
    };

    const loadView = jest.fn(async (route: MatchedRouteInfo) => {
      order.push(`view:${route.pattern}`);
      return {};
    });
    const viewGraph = createViewGraphFromLoadView(loadView);

    const graph = createGraph(viewGraph, dataGraph as unknown as DataGraph);
    const signal = new AbortController().signal;
    const transaction = { phaseMode: 'navigation', signal } as NavigationTransaction;

    const resultPromise = graph.load(branch, {
      branch,
      transaction,
    });

    await Promise.resolve();
    expect(order).toEqual(
      expect.arrayContaining(['data-start:/app,/app/page', 'view:/app', 'view:/app/page']),
    );
    expect(order).not.toContain('data-done');

    releaseData();
    const result = await resultPromise;
    expect(order).toContain('data-done');

    expect(dataGraph.load).toHaveBeenCalledWith(branch, {
      branch,
      transaction,
      mode: 'navigation',
    });
    expect(result.data?.get('k')).toEqual({ ok: true });
    expect(result.view).toEqual([null, null]);
  });

  it('navigation load assembles view payloads in enterRoutes order', async () => {
    const layout = matchedRoute('/app', { layout: '<slot></slot>', view: null });
    const page = matchedRoute('/app/home', { asyncView: true });
    const branch = [layout, page];

    const dataGraph = {
      load: jest.fn(async () => ({})),
    };
    const viewGraph = {
      load: jest.fn(async (routes: MatchedRouteInfo[]) => ({
        data: routes.map((route) =>
          route.pattern === '/app' ? { data: '<layout/>' } : { data: '<page/>' },
        ),
      })),
    };

    const graph = createGraph(viewGraph as unknown as ViewGraph, dataGraph as unknown as DataGraph);
    const transaction = {
      phaseMode: 'navigation',
      signal: new AbortController().signal,
    } as NavigationTransaction;

    const result = await graph.load(branch, { branch, transaction });

    expect(result.error).toBeUndefined();
    expect(result.view).toEqual(['<layout/>', '<page/>']);
  });

  it('prefetch mode warms data and views and returns soft empty result', async () => {
    const leaf = matchedRoute('/x', { load: ['data'], asyncView: true });
    const signal = new AbortController().signal;
    const transaction = { phaseMode: 'prefetch', signal } as NavigationTransaction;

    const dataGraph = {
      load: jest.fn(async () => ({ data: new Map() })),
    };
    const viewGraph = {
      load: jest.fn(async () => ({})),
    };

    const graph = createGraph(viewGraph as unknown as ViewGraph, dataGraph as unknown as DataGraph);
    const result = await graph.load([leaf], {
      branch: [leaf],
      transaction,
    });

    expect(result).toEqual({});
    expect(dataGraph.load).toHaveBeenCalledWith([leaf], {
      branch: [leaf],
      transaction,
      mode: 'prefetch',
    });
    expect(viewGraph.load).toHaveBeenCalledWith([leaf], signal, {
      mode: 'prefetch',
      transaction,
    });
  });
});

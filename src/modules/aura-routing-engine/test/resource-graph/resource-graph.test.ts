import type { DataGraph } from '../../core/data-graph';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { ResourceGraph } from '../../core/resource-graph';
import type { ViewGraph } from '../../core/view-graph';
import { createTestRoute } from '../helpers/create-test-route';

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
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, {
      load,
      layout,
      view:
        view !== undefined
          ? view
          : asyncView
            ? { loader: 'url', content: `${path}.html` }
            : { loader: 'html', content: '<span/>' },
    }) as MatchedRouteInfo['route'],
  };
}

describe('ResourceGraph', () => {
  it('buildLoadPlan splits data routes and independent content routes', () => {
    const parent = matchedRoute('/app', { load: ['layout'] });
    const leaf = matchedRoute('/app/home', { load: ['page'], asyncView: true });
    const staticOnly = matchedRoute('/about', { asyncView: true });

    const graph = new ResourceGraph({} as ViewGraph, {} as DataGraph);
    const plan = graph.buildLoadPlan([parent, leaf, staticOnly]);

    expect(plan.dataRoutes).toEqual([parent, leaf]);
    expect(plan.contentRoutes.map((r) => r.pattern)).toEqual([
      '/app',
      '/app/home',
      '/about',
    ]);
  });

  it('buildLoadPlan puts layout-only routes into contentRoutes', () => {
    const folder = matchedRoute('/settings', {
      load: ['settings-data'],
      layout: '<slot></slot>',
      view: null,
    });
    const leaf = matchedRoute('/settings/profile', { asyncView: true });

    const graph = new ResourceGraph({} as ViewGraph, {} as DataGraph);
    const plan = graph.buildLoadPlan([folder, leaf]);

    expect(plan.dataRoutes).toEqual([folder]);
    expect(plan.contentRoutes.map((r) => r.pattern)).toEqual([
      '/settings',
      '/settings/profile',
    ]);
    expect(plan.dataBoundContentRoutes).toEqual([]);
  });

  it('navigation load runs dataGraph.load once in parallel with content views', async () => {
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
        return { snapshot: new Map([['k', { ok: true }]]) };
      }),
      prefetch: jest.fn(),
    };

    const viewGraph = {
      loadView: jest.fn(async (route: MatchedRouteInfo) => {
        order.push(`view:${route.pattern}`);
        return null;
      }),
      prefetchBranch: jest.fn(),
    };

    const graph = new ResourceGraph(viewGraph as unknown as ViewGraph, dataGraph as unknown as DataGraph);
    const signal = new AbortController().signal;
    const transaction = {} as NavigationTransaction;

    const resultPromise = graph.resolve(branch, {
      mode: 'navigation',
      branch,
      signal,
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

    expect(dataGraph.load).toHaveBeenCalledWith(branch, { branch, transaction });
    expect(result.snapshot?.get('k')).toEqual({ ok: true });
  });

  it('speculative mode prefetches data and content in parallel', async () => {
    const leaf = matchedRoute('/x', { load: ['data'], asyncView: true });
    const signal = new AbortController().signal;

    const dataGraph = {
      load: jest.fn(),
      prefetch: jest.fn(async () => undefined),
    };
    const viewGraph = {
      loadView: jest.fn(),
      prefetchBranch: jest.fn(async () => undefined),
    };

    const graph = new ResourceGraph(viewGraph as unknown as ViewGraph, dataGraph as unknown as DataGraph);
    await graph.resolve([leaf], {
      mode: 'speculative',
      branch: [leaf],
      signal,
      transaction: {} as NavigationTransaction,
    });

    expect(dataGraph.prefetch).toHaveBeenCalledWith([leaf], { signal, mode: 'intent' });
    expect(viewGraph.prefetchBranch).toHaveBeenCalledWith([leaf], signal);
    expect(dataGraph.load).not.toHaveBeenCalled();
  });
});

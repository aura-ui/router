import { DataGraph } from '../../core/data-graph';
import { NO_PRESERVE } from '../../core/content/model/preserve';
import { HookRegistry } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { AuraRoutingProcessorJob } from '../../core/processor/cancellation/job';
import { ViewCommitTracker } from '../../core/view-mount/view-commit-tracker';
import { createTestRoute } from '../helpers/create-test-route';

function matchedRoute(path: string, load: string[] | null = ['data']): MatchedRouteInfo {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, { load }) as MatchedRouteInfo['route'],
  };
}

function runtime(hookRegistry: HookRegistry, route: MatchedRouteInfo) {
  const navigationJob = new AuraRoutingProcessorJob(1);
  return {
    transaction: {
      from: null,
      to: route,
      action: 'push' as const,
      plan: { enterRoutes: [route], exitRoutes: [], lca: null, reenter: false },
    },
    navigationJob,
    router: { navigate: jest.fn() },
    hookRegistry,
    viewCommitTracker: new ViewCommitTracker(route.href),
    isJobActive: () => true,
  };
}

describe('DataGraph', () => {
  let hookRegistry: HookRegistry;
  let dataGraph: DataGraph;

  beforeEach(() => {
    hookRegistry = new HookRegistry();
    dataGraph = new DataGraph(hookRegistry, { staleTime: 60_000 });
  });

  afterEach(() => {
    dataGraph.destroy();
  });

  it('skips hook fetch on cache hit but still runs onLoad', async () => {
    let hookCalls = 0;
    let onLoadCalls = 0;

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        hookCalls++;
        return { id: 1 };
      },
    });

    const route = matchedRoute('/users');
    (route.route as { onLoad: () => void }).onLoad = () => {
      onLoadCalls++;
    };

    const ctx = runtime(hookRegistry, route);

    await dataGraph.load([route], { runtime: ctx });
    await dataGraph.load([route], { runtime: ctx });

    expect(hookCalls).toBe(1);
    expect(onLoadCalls).toBe(2);
  });

  it('stores hook payload in cache and snapshot', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => ({ id: 42, name: 'Ada' }),
    });

    const route = matchedRoute('/users');
    const { snapshot } = await dataGraph.load([route], {
      runtime: runtime(hookRegistry, route),
    });

    const key = [...snapshot.keys()][0]!;
    expect(snapshot.get(key)).toEqual({ id: 42, name: 'Ada' });
  });

  it('returns redirect from navigation load with empty snapshot', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => '/login',
    });

    const route = matchedRoute('/admin');
    const { outcome, snapshot } = await dataGraph.load([route], {
      runtime: runtime(hookRegistry, route),
    });

    expect(outcome).toEqual({ status: 'redirect', url: '/login' });
    expect(snapshot.size).toBe(0);
  });

  it('prefetch ignores redirect and does not cache', async () => {
    let loads = 0;
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        loads++;
        return '/login';
      },
    });

    const route = matchedRoute('/admin');
    await dataGraph.prefetch([route], { mode: 'intent' });
    await dataGraph.prefetch([route], { mode: 'intent' });

    expect(loads).toBe(2);
  });

  it('does not cache load hooks when preserve data is off', async () => {
    let hookCalls = 0;

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        hookCalls++;
        return { id: 1 };
      },
    });

    const route = matchedRoute('/users');
    (route.route as { preserve: typeof NO_PRESERVE }).preserve = NO_PRESERVE;

    const ctx = runtime(hookRegistry, route);

    await dataGraph.load([route], { runtime: ctx });
    await dataGraph.load([route], { runtime: ctx });

    expect(hookCalls).toBe(2);
  });

  it('invalidate clears cache', async () => {
    let loads = 0;
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        loads++;
        return { n: loads };
      },
    });

    const route = matchedRoute('/items');
    const ctx = runtime(hookRegistry, route);

    await dataGraph.load([route], { runtime: ctx });
    dataGraph.invalidateAll();
    await dataGraph.load([route], { runtime: ctx });

    expect(loads).toBe(2);
  });

  it('aborts sibling loads on redirect', async () => {
    let siblingLoads = 0;

    hookRegistry.register({
      name: 'layout',
      version: '1.0.0',
      fn: async () => '/login',
    });

    hookRegistry.register({
      name: 'child',
      version: '1.0.0',
      fn: async (ctx) => {
        await new Promise((r) => setTimeout(r, 50));
        if (ctx.signal.aborted) return null;
        siblingLoads++;
        return { ok: true };
      },
    });

    const layout = matchedRoute('/app', ['layout']);
    const child = matchedRoute('/app/page', ['child']);
    const ctx = runtime(hookRegistry, layout);

    await dataGraph.load([layout, child], { runtime: ctx });

    expect(siblingLoads).toBe(0);
  });

  it('builds snapshot from full chain including LCA cache hits', async () => {
    hookRegistry.register({
      name: 'parent-data',
      version: '1.0.0',
      fn: async () => ({ role: 'layout' }),
    });

    hookRegistry.register({
      name: 'leaf-data',
      version: '1.0.0',
      fn: async () => ({ page: 'home' }),
    });

    const parent = matchedRoute('/app', ['parent-data']);
    const leaf = matchedRoute('/app/home', ['leaf-data']);
    leaf.chain = [parent, leaf];
    parent.chain = leaf.chain;

    await dataGraph.load([parent], {
      runtime: runtime(hookRegistry, parent),
      chain: [parent],
    });

    const { snapshot } = await dataGraph.load([leaf], {
      runtime: runtime(hookRegistry, leaf),
      chain: [parent, leaf],
    });

    expect(snapshot.size).toBe(2);
    expect(snapshot.get([...snapshot.keys()].find((k) => k.includes('/app|'))!)).toEqual({
      role: 'layout',
    });
  });
});

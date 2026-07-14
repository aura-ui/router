import { DataGraph } from '../../core/data-graph';
import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { HookRegistry } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { finalizeTransitionPlan } from '../../core/route-tree/transition-plan';
import { createMockEngine } from '../helpers/create-mock-transaction';
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

function loadTransaction(
  hookRegistry: HookRegistry,
  enterRoutes: readonly MatchedRouteInfo[],
): NavigationTransaction {
  const to = enterRoutes[enterRoutes.length - 1]!;
  const engine = { ...createMockEngine(), hooksRegistry: hookRegistry } as AuraRoutingEngine;
  const transaction = new NavigationTransaction(
    1,
    0,
    {
      from: null,
      to,
      action: 'push',
      href: to.href,
      hash: '',
      options: { replace: false, syncHistory: true },
    },
    () => false,
    engine,
  );
  transaction.transitionPlan = finalizeTransitionPlan({
    enterRoutes: [...enterRoutes],
    exitRoutes: [],
    lca: null,
    update: false,
  });
  return transaction;
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

    const transaction = loadTransaction(hookRegistry, [route]);

    await dataGraph.load([route], { transaction });
    await dataGraph.load([route], { transaction });

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
      transaction: loadTransaction(hookRegistry, [route]),
    });

    const key = [...snapshot!.keys()][0]!;
    expect(snapshot!.get(key)).toEqual({ id: 42, name: 'Ada' });
  });

  it('stores hook payload with arbitrary type field', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => ({ type: 'article', id: 7, title: 'Hello' }),
    });

    const route = matchedRoute('/posts/7');
    const { snapshot } = await dataGraph.load([route], {
      transaction: loadTransaction(hookRegistry, [route]),
    });

    const key = [...snapshot!.keys()][0]!;
    expect(snapshot!.get(key)).toEqual({ type: 'article', id: 7, title: 'Hello' });
  });

  it('treats string load return as payload not redirect', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => '/login',
    });

    const route = matchedRoute('/admin');
    const { outcome, snapshot } = await dataGraph.load([route], {
      transaction: loadTransaction(hookRegistry, [route]),
    });

    expect(outcome).toBeUndefined();
    const key = [...snapshot!.keys()][0]!;
    expect(snapshot!.get(key)).toBe('/login');
  });

  it('prefetch caches string payload from load hook', async () => {
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

    expect(loads).toBe(1);
  });

  it('returns cancelled when load hook returns false', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => false,
    });

    const route = matchedRoute('/admin');
    const { outcome } = await dataGraph.load([route], {
      transaction: loadTransaction(hookRegistry, [route]),
    });

    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('omits snapshot when no cache.data entries on the active branch', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => ({ id: 1 }),
    });

    const route = matchedRoute('/users');
    route.route.cache = NO_CACHE;

    const { snapshot } = await dataGraph.load([route], {
      transaction: loadTransaction(hookRegistry, [route]),
    });

    expect(snapshot).toBeUndefined();
  });

  it('does not cache load hooks when cache.data is off', async () => {
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
    route.route.cache = NO_CACHE;

    const transaction = loadTransaction(hookRegistry, [route]);

    await dataGraph.load([route], { transaction });
    await dataGraph.load([route], { transaction });

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
    const transaction = loadTransaction(hookRegistry, [route]);

    await dataGraph.load([route], { transaction });
    dataGraph.invalidate({ policy: 'remove' });
    await dataGraph.load([route], { transaction });

    expect(loads).toBe(2);
  });

  it('does not abort sibling loads on non-terminal hook return', async () => {
    let siblingLoads = 0;

    hookRegistry.register({
      name: 'layout',
      version: '1.0.0',
      fn: async () => '/login',
    });

    hookRegistry.register({
      name: 'child',
      version: '1.0.0',
      fn: async () => {
        siblingLoads++;
        return { ok: true };
      },
    });

    const layout = matchedRoute('/app', ['layout']);
    const child = matchedRoute('/app/page', ['child']);
    const transaction = loadTransaction(hookRegistry, [layout, child]);

    await dataGraph.load([layout, child], { transaction });

    expect(siblingLoads).toBe(1);
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
      transaction: loadTransaction(hookRegistry, [parent]),
      activeChain: [parent],
    });

    const { snapshot } = await dataGraph.load([leaf], {
      transaction: loadTransaction(hookRegistry, [leaf]),
      activeChain: [parent, leaf],
    });

    expect(snapshot!.size).toBe(2);
    expect(snapshot!.get([...snapshot!.keys()].find((k) => k.includes('/app|'))!)).toEqual({
      role: 'layout',
    });
  });
});

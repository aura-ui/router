import { DataGraph } from '../../core/data-graph';
import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { HookRegistry } from '../../core/hooks/registry';
import { resourceKeys } from '../../core/match/resource-keys';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { HandoffCache } from '../../core/resource-graph';
import { finalizeTransitionPlan } from '../../core/route-tree/transition-plan';
import { createMockEngine } from '../helpers/create-mock-transaction';
import { createTestRoute } from '../helpers/create-test-route';

function matchedRoute(path: string, load: string[] | null = ['data']): MatchedRouteInfo {
  const info: MatchedRouteInfo = {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, { load }) as MatchedRouteInfo['route'],
  };
  const keys = resourceKeys(info);
  info.dataKey = keys.dataKey;
  info.viewKey = keys.viewKey;
  return info;
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

function navOptions(
  hookRegistry: HookRegistry,
  enterRoutes: readonly MatchedRouteInfo[],
  branch?: readonly MatchedRouteInfo[],
) {
  return {
    transaction: loadTransaction(hookRegistry, enterRoutes),
    mode: 'navigation' as const,
    ...(branch ? { branch } : {}),
  };
}

describe('DataGraph', () => {
  let hookRegistry: HookRegistry;
  let dataGraph: DataGraph;

  beforeEach(() => {
    hookRegistry = new HookRegistry();
    dataGraph = new DataGraph(hookRegistry, new HandoffCache(), { staleTime: 60_000 });
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

    const options = navOptions(hookRegistry, [route]);

    await dataGraph.load([route], options);
    await dataGraph.load([route], options);

    expect(hookCalls).toBe(1);
    expect(onLoadCalls).toBe(2);
  });

  it('stores hook payload in cache and data map', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => ({ id: 42, name: 'Ada' }),
    });

    const route = matchedRoute('/users');
    const { data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

    const key = [...data!.keys()][0]!;
    expect(data!.get(key)).toEqual({ id: 42, name: 'Ada' });
  });

  it('stores hook payload with arbitrary type field', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => ({ type: 'article', id: 7, title: 'Hello' }),
    });

    const route = matchedRoute('/posts/7');
    const { data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

    const key = [...data!.keys()][0]!;
    expect(data!.get(key)).toEqual({ type: 'article', id: 7, title: 'Hello' });
  });

  it('treats string load return as payload not redirect', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => '/login',
    });

    const route = matchedRoute('/admin');
    const { error, data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

    expect(error).toBeUndefined();
    const key = [...data!.keys()][0]!;
    expect(data!.get(key)).toBe('/login');
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
    const options = {
      transaction: loadTransaction(hookRegistry, [route]),
      mode: 'prefetch' as const,
    };
    await dataGraph.prefetch([route], options);
    await dataGraph.prefetch([route], options);

    expect(loads).toBe(1);
  });

  it('stores false load return as payload (cancel is signal-driven)', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => false,
    });

    const route = matchedRoute('/admin');
    const { error, data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

    expect(error).toBeUndefined();
    const key = [...data!.keys()][0]!;
    expect(data!.get(key)).toBe(false);
  });

  it('returns navigation data even when cache.data is off', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => ({ id: 1 }),
    });

    const route = matchedRoute('/users');
    route.route.cache = NO_CACHE;

    const { data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

    expect(data).toBeDefined();
    const key = [...data!.keys()][0]!;
    expect(data!.get(key)).toEqual({ id: 1 });
    // Not preserved in SWR cache when cache.data is off
    expect(dataGraph.getData(route)).toBeUndefined();
  });

  it('does not write long cache when cache.data is off (handoff still dedupes)', async () => {
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
    const options = navOptions(hookRegistry, [route]);

    await dataGraph.load([route], options);
    await dataGraph.load([route], options);

    expect(hookCalls).toBe(1);
    expect(dataGraph.getData(route)).toBeUndefined();

    // Fresh handoff → load again (no long-cache persist)
    const graph2 = new DataGraph(hookRegistry, new HandoffCache());
    await graph2.load([route], options);
    expect(hookCalls).toBe(2);
    graph2.destroy();
  });

  it('invalidate clears long cache; new handoff reloads', async () => {
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
    const options = navOptions(hookRegistry, [route]);

    await dataGraph.load([route], options);
    expect(dataGraph.getData(route)).toEqual({ n: 1 });
    dataGraph.invalidate({ policy: 'remove' });
    expect(dataGraph.getData(route)).toBeUndefined();

    const graph2 = new DataGraph(hookRegistry, new HandoffCache(), { staleTime: 60_000 });
    await graph2.load([route], options);
    graph2.destroy();

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

    await dataGraph.load([layout, child], navOptions(hookRegistry, [layout, child]));

    expect(siblingLoads).toBe(1);
  });

  it('keeps LCA parent payload in cache while navigation data is enter-only', async () => {
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

    await dataGraph.load([parent], navOptions(hookRegistry, [parent], [parent]));

    const { data } = await dataGraph.load(
      [leaf],
      navOptions(hookRegistry, [leaf], [parent, leaf]),
    );

    // Navigation data covers enter routes only (leaf); parent stays in SWR cache.
    expect(data!.size).toBe(1);
    expect(data!.get([...data!.keys()][0]!)).toEqual({ page: 'home' });
    expect(dataGraph.getData(parent)).toEqual({ role: 'layout' });

    const branchSnapshot = dataGraph.snapshot([parent, leaf]);
    expect(branchSnapshot!.size).toBe(2);
  });

  it('keeps enter loads parallel when child does not call parent()', async () => {
    let parentStarted = false;
    let childStartedBeforeParentDone = false;
    let releaseParent!: () => void;
    const parentGate = new Promise<void>((resolve) => {
      releaseParent = resolve;
    });

    hookRegistry.register({
      name: 'parent-data',
      version: '1.0.0',
      fn: async () => {
        parentStarted = true;
        await parentGate;
        return { orgId: 1 };
      },
    });

    hookRegistry.register({
      name: 'child-data',
      version: '1.0.0',
      fn: async () => {
        childStartedBeforeParentDone = parentStarted;
        return { users: [] };
      },
    });

    const parent = matchedRoute('/settings', ['parent-data']);
    const child = matchedRoute('/settings/users', ['child-data']);
    const branch = [parent, child];

    const loadPromise = dataGraph.load(branch, navOptions(hookRegistry, branch, branch));

    await Promise.resolve();
    expect(parentStarted).toBe(true);
    expect(childStartedBeforeParentDone).toBe(true);
    releaseParent();
    await loadPromise;
  });

  it('joins nearest ancestor payload when child awaits ctx.parent()', async () => {
    let childSawParent: unknown;

    hookRegistry.register({
      name: 'parent-data',
      version: '1.0.0',
      fn: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { orgId: 7 };
      },
    });

    hookRegistry.register({
      name: 'child-data',
      version: '1.0.0',
      fn: async (ctx) => {
        childSawParent = await ctx.parent?.();
        return { users: [(childSawParent as { orgId: number }).orgId] };
      },
    });

    const parent = matchedRoute('/settings', ['parent-data']);
    const child = matchedRoute('/settings/users', ['child-data']);
    const branch = [parent, child];

    const { data } = await dataGraph.load(branch, navOptions(hookRegistry, branch, branch));

    expect(childSawParent).toEqual({ orgId: 7 });
    expect(data!.get([...data!.keys()].find((k) => k.includes('/settings/users'))!)).toEqual({
      users: [7],
    });
  });

  it('resolves ctx.parent() from LCA cache when parent is outside enterRoutes', async () => {
    let childSawParent: unknown;

    hookRegistry.register({
      name: 'parent-data',
      version: '1.0.0',
      fn: async () => ({ orgId: 3 }),
    });

    hookRegistry.register({
      name: 'child-data',
      version: '1.0.0',
      fn: async (ctx) => {
        childSawParent = await ctx.parent?.();
        return { ok: true };
      },
    });

    const parent = matchedRoute('/app', ['parent-data']);
    const leaf = matchedRoute('/app/home', ['child-data']);
    const branch = [parent, leaf];

    await dataGraph.load([parent], navOptions(hookRegistry, [parent], [parent]));

    await dataGraph.load([leaf], navOptions(hookRegistry, [leaf], branch));

    expect(childSawParent).toEqual({ orgId: 3 });
  });

  it('returns undefined from ctx.parent() when no ancestor has load', async () => {
    let parentResult: unknown = 'unset';

    hookRegistry.register({
      name: 'child-data',
      version: '1.0.0',
      fn: async (ctx) => {
        parentResult = await ctx.parent?.();
        return { ok: true };
      },
    });

    const leaf = matchedRoute('/alone', ['child-data']);
    await dataGraph.load([leaf], navOptions(hookRegistry, [leaf], [leaf]));

    expect(parentResult).toBeUndefined();
  });

  it('keeps handoff load alive when prefetch aborts; navigation joins once', async () => {
    let loads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        loads++;
        await gate;
        return { id: 1 };
      },
    });

    const route = matchedRoute('/users');
    route.route.cache = NO_CACHE;

    const prefetchTx = loadTransaction(hookRegistry, [route]);
    const prefetchPromise = dataGraph.prefetch([route], {
      transaction: prefetchTx,
      mode: 'prefetch',
    });

    await Promise.resolve();
    expect(loads).toBe(1);

    prefetchTx.cancel();
    await expect(prefetchPromise).resolves.toMatchObject({ data: expect.any(Map) });

    const navigation = dataGraph.load([route], navOptions(hookRegistry, [route]));
    release();
    const { error, data } = await navigation;

    expect(error).toBeUndefined();
    expect(loads).toBe(1);
    expect(data!.get(route.dataKey!)).toEqual({ id: 1 });
  });

  it('cancels navigation waiter on abort without poisoning handoff for the next join', async () => {
    let loads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        loads++;
        await gate;
        return { id: 2 };
      },
    });

    const route = matchedRoute('/items');
    route.route.cache = NO_CACHE;

    const firstTx = loadTransaction(hookRegistry, [route]);
    const first = dataGraph.load([route], {
      transaction: firstTx,
      mode: 'navigation',
    });

    await Promise.resolve();
    firstTx.cancel();
    await expect(first).resolves.toEqual({ error: { status: 'cancelled' } });

    const second = dataGraph.load([route], navOptions(hookRegistry, [route]));
    release();
    const { error, data } = await second;

    expect(error).toBeUndefined();
    expect(loads).toBe(1);
    expect(data!.get(route.dataKey!)).toEqual({ id: 2 });
  });

  it('does not abort shared load hooks via caller transactionSignal', async () => {
    let sawAbortedInsideHook = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async (ctx) => {
        await gate;
        sawAbortedInsideHook = ctx.transactionSignal.aborted;
        return { ok: true };
      },
    });

    const route = matchedRoute('/signal');
    route.route.cache = NO_CACHE;

    const tx = loadTransaction(hookRegistry, [route]);
    const pending = dataGraph.prefetch([route], { transaction: tx, mode: 'prefetch' });

    await Promise.resolve();
    tx.cancel();
    release();
    await pending;

    expect(sawAbortedInsideHook).toBe(false);
  });
});

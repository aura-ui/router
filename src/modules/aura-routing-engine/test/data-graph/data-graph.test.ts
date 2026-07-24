import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { DataGraph } from '../../core/data-graph';
import { HookRegistry } from '../../core/hooks/registry';
import { HandoffCache } from '../../core/resource-graph';
import {
  createDataGraphLoadOptions as navOptions,
  createDataGraphTransaction as loadTransaction,
  createDataMatchedRoute as matchedRoute,
  createMockEngine,
  createNavigationTransaction,
} from '../_helpers/create-mock-transaction';
import { asLoadHook } from '../_helpers/resource-graph-fixtures';

describe('DataGraph', () => {
  let hookRegistry: HookRegistry;
  let dataGraph: DataGraph;

  beforeEach(() => {
    hookRegistry = new HookRegistry();
    dataGraph = new DataGraph(new HandoffCache(), { hooks: hookRegistry, cache: { staleTime: 60_000 } });
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
      fn: asLoadHook(async () => {
        hookCalls++;
        return { id: 1 };
      }),
    });

    const route = matchedRoute('/users');
    (route.route as unknown as { onLoad: () => void }).onLoad = () => {
      onLoadCalls++;
    };

    const options = navOptions(hookRegistry, [route]);

    await dataGraph.load([route], options);
    await dataGraph.load([route], options);

    expect(hookCalls).toBe(1);
    expect(onLoadCalls).toBe(2);
  });

  it('honors per-route cacheTime for long-cache expiry', async () => {
    jest.useFakeTimers();
    // Short handoff TTL so revisit hits long `cache.data`, not the prepare buffer.
    const graph = new DataGraph(new HandoffCache({ ttl: 100 }), {
      hooks: hookRegistry,
      cache: { staleTime: 60_000, gcTime: 60_000 },
    });

    try {
      let hookCalls = 0;
      hookRegistry.register({
        name: 'data',
        version: '1.0.0',
        fn: asLoadHook(async () => {
          hookCalls++;
          return { id: hookCalls };
        }),
      });

      const short = matchedRoute('/short');
      short.route.cacheTime = 1_000;
      const long = matchedRoute('/long');
      long.route.cacheTime = 10_000;

      await graph.load([short], navOptions(hookRegistry, [short]));
      await graph.load([long], navOptions(hookRegistry, [long]));
      expect(hookCalls).toBe(2);

      jest.advanceTimersByTime(1_001);

      await graph.load([short], navOptions(hookRegistry, [short]));
      await graph.load([long], navOptions(hookRegistry, [long]));

      expect(hookCalls).toBe(3);
      expect(graph.getData(long)).toEqual({ id: 2 });
    } finally {
      graph.destroy();
      jest.useRealTimers();
    }
  });

  it('stores hook payload in cache and data map', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: asLoadHook(async () => ({ id: 42, name: 'Ada' })),
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
      fn: asLoadHook(async () => ({ type: 'article', id: 7, title: 'Hello' })),
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
    await dataGraph.load([route], options);
    await dataGraph.load([route], options);

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
      fn: asLoadHook(async () => ({ id: 1 })),
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
      fn: asLoadHook(async () => {
        hookCalls++;
        return { id: 1 };
      }),
    });

    const route = matchedRoute('/users');
    route.route.cache = NO_CACHE;
    const options = navOptions(hookRegistry, [route]);

    await dataGraph.load([route], options);
    await dataGraph.load([route], options);

    expect(hookCalls).toBe(1);
    expect(dataGraph.getData(route)).toBeUndefined();

    // Fresh handoff → load again (no long-cache persist)
    const graph2 = new DataGraph(new HandoffCache(), { hooks: hookRegistry });
    await graph2.load([route], options);
    expect(hookCalls).toBe(2);
    graph2.destroy();
  });

  it('invalidate clears long cache; new handoff reloads', async () => {
    let loads = 0;
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: asLoadHook(async () => {
        loads++;
        return { n: loads };
      }),
    });

    const route = matchedRoute('/items');
    const options = navOptions(hookRegistry, [route]);

    await dataGraph.load([route], options);
    expect(dataGraph.getData(route)).toEqual({ n: 1 });
    dataGraph.invalidate({ policy: 'remove' });
    expect(dataGraph.getData(route)).toBeUndefined();

    const graph2 = new DataGraph(new HandoffCache(), { hooks: hookRegistry, cache: { staleTime: 60_000 } });
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
      fn: asLoadHook(async () => {
        siblingLoads++;
        return { ok: true };
      }),
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
      fn: asLoadHook(async () => ({ role: 'layout' })),
    });

    hookRegistry.register({
      name: 'leaf-data',
      version: '1.0.0',
      fn: asLoadHook(async () => ({ page: 'home' })),
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
      fn: asLoadHook(async () => {
        parentStarted = true;
        await parentGate;
        return { orgId: 1 };
      }),
    });

    hookRegistry.register({
      name: 'child-data',
      version: '1.0.0',
      fn: asLoadHook(async () => {
        childStartedBeforeParentDone = parentStarted;
        return { users: [] };
      }),
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
      fn: asLoadHook(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { orgId: 7 };
      }),
    });

    hookRegistry.register({
      name: 'child-data',
      version: '1.0.0',
      fn: asLoadHook(async (ctx) => {
        childSawParent = await ctx.parent?.();
        return { users: [(childSawParent as { orgId: number }).orgId] };
      }),
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
      fn: asLoadHook(async () => ({ orgId: 3 })),
    });

    hookRegistry.register({
      name: 'child-data',
      version: '1.0.0',
      fn: asLoadHook(async (ctx) => {
        childSawParent = await ctx.parent?.();
        return { ok: true };
      }),
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
      fn: asLoadHook(async (ctx) => {
        parentResult = await ctx.parent?.();
        return { ok: true };
      }),
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
      fn: asLoadHook(async () => {
        loads++;
        await gate;
        return { id: 1 };
      }),
    });

    const route = matchedRoute('/users');
    route.route.cache = NO_CACHE;

    const prefetchTx = loadTransaction(hookRegistry, [route]);
    const prefetchPromise = dataGraph.load([route], {
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

  it('aborts shared workSignal when sole navigation hold releases', async () => {
    let loads = 0;
    let workSignal!: AbortSignal;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: asLoadHook(async (ctx) => {
        loads++;
        workSignal = ctx.transactionSignal;
        await Promise.race([
          gate,
          new Promise<never>((_, reject) => {
            onAbortOnce(ctx.transactionSignal, () => {
              reject(ctx.transactionSignal.reason ?? new DOMException('Aborted', 'AbortError'));
            });
          }),
        ]);
        return { id: 2 };
      }),
    });

    const route = matchedRoute('/items');
    route.route.cache = NO_CACHE;

    const firstTx = loadTransaction(hookRegistry, [route]);
    const first = dataGraph.load([route], {
      transaction: firstTx,
      mode: 'navigation',
    });

    await Promise.resolve();
    expect(loads).toBe(1);
    expect(workSignal.aborted).toBe(false);

    firstTx.cancel();
    await expect(first).resolves.toEqual({ error: { status: 'cancelled' } });
    expect(workSignal.aborted).toBe(true);

    // New generation after work abort — second navigation loads again.
    const second = dataGraph.load([route], navOptions(hookRegistry, [route]));
    releaseGate();
    const { error, data } = await second;

    expect(error).toBeUndefined();
    expect(loads).toBe(2);
    expect(data!.get(route.dataKey!)).toEqual({ id: 2 });
  });

  it('does not abort workSignal when prefetch interest cancels', async () => {
    let sawAbortedInsideHook = false;
    let workSignal!: AbortSignal;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: asLoadHook(async (ctx) => {
        workSignal = ctx.transactionSignal;
        await gate;
        sawAbortedInsideHook = ctx.transactionSignal.aborted;
        return { ok: true };
      }),
    });

    const route = matchedRoute('/signal');
    route.route.cache = NO_CACHE;

    const tx = loadTransaction(hookRegistry, [route]);
    const pending = dataGraph.load([route], { transaction: tx, mode: 'prefetch' });

    await Promise.resolve();
    tx.cancel();
    release();
    await pending;

    expect(sawAbortedInsideHook).toBe(false);
    expect(workSignal.aborted).toBe(false);
  });

  it('keeps shared work alive while a later navigation waiter still holds the key', async () => {
    let loads = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: asLoadHook(async (ctx) => {
        loads++;
        await Promise.race([
          gate,
          new Promise<never>((_, reject) => {
            onAbortOnce(ctx.transactionSignal, () => {
              reject(ctx.transactionSignal.reason ?? new DOMException('Aborted', 'AbortError'));
            });
          }),
        ]);
        return { id: 3 };
      }),
    });

    const route = matchedRoute('/overlap');
    route.route.cache = NO_CACHE;

    const firstTx = loadTransaction(hookRegistry, [route]);
    const first = dataGraph.load([route], {
      transaction: firstTx,
      mode: 'navigation',
    });

    await Promise.resolve();
    expect(loads).toBe(1);

    // Second navigation holds before first releases (overlap) → join, no abort yet.
    const second = dataGraph.load([route], navOptions(hookRegistry, [route]));
    await Promise.resolve();

    firstTx.cancel();
    await expect(first).resolves.toEqual({ error: { status: 'cancelled' } });

    releaseGate();
    const { error, data } = await second;

    expect(error).toBeUndefined();
    expect(loads).toBe(1);
    expect(data!.get(route.dataKey!)).toEqual({ id: 3 });
  });

  it('configure merges default cache options for new graphs', () => {
    const graphProto = DataGraph as unknown as { defaultCacheOptions: Record<string, unknown> };
    const prev = { ...graphProto.defaultCacheOptions };
    try {
      DataGraph.configure({ max: 7, staleTime: 12_000 });
      const graph = new DataGraph(new HandoffCache(), { hooks: hookRegistry });
      expect(graph).toBeInstanceOf(DataGraph);
      graph.destroy();
    } finally {
      graphProto.defaultCacheOptions = prev;
    }
  });

  it('skips enter routes without dataKey', async () => {
    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        throw new Error('should not run');
      },
    });

    const route = matchedRoute('/no-key');
    delete route.dataKey;

    const { error, data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));
    expect(error).toBeUndefined();
    expect(data!.size).toBe(0);
  });

  it('soft-skips routes with no load hooks', async () => {
    const route = matchedRoute('/static', null);
    const { error, data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

    expect(error).toBeUndefined();
    expect(data!.size).toBe(1);
    expect(data!.get(route.dataKey!)).toBeUndefined();
  });

  it('warns on unknown hook names and still settles', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const route = matchedRoute('/missing', ['unknown-hook']);
      const { error, data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

      expect(error).toBeUndefined();
      expect(data!.get(route.dataKey!)).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown hook "unknown-hook"'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('aggregates multiple load hooks on one route into a name→value map', async () => {
    hookRegistry.register({
      name: 'a',
      version: '1.0.0',
      fn: asLoadHook(async () => 1),
    });
    hookRegistry.register({
      name: 'b',
      version: '1.0.0',
      fn: asLoadHook(async () => ({ ok: true })),
    });

    const route = matchedRoute('/multi', ['a', 'b']);
    const { data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

    expect(data!.get(route.dataKey!)).toEqual({ a: 1, b: { ok: true } });
  });

  it('cancels sibling waiters when one enter route fails', async () => {
    let releaseSibling!: () => void;
    const siblingGate = new Promise<void>((resolve) => {
      releaseSibling = resolve;
    });

    hookRegistry.register({
      name: 'fast-fail',
      version: '1.0.0',
      fn: async () => {
        throw new Error('boom');
      },
    });
    hookRegistry.register({
      name: 'slow',
      version: '1.0.0',
      fn: asLoadHook(async () => {
        await siblingGate;
        return { ok: true };
      }),
    });

    const failing = matchedRoute('/fail', ['fast-fail']);
    const slow = matchedRoute('/slow', ['slow']);
    failing.route.cache = NO_CACHE;
    slow.route.cache = NO_CACHE;

    const loadPromise = dataGraph.load(
      [failing, slow],
      navOptions(hookRegistry, [failing, slow]),
    );
    await Promise.resolve();
    releaseSibling();

    const { error, data } = await loadPromise;
    expect(error).toMatchObject({ status: 'error' });
    expect(data).toBeUndefined();
  });

  it('returns cancelled when transaction goes stale after shared load settles', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let stale = false;

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: asLoadHook(async () => {
        await gate;
        return { id: 9 };
      }),
    });

    const route = matchedRoute('/stale');
    route.route.cache = NO_CACHE;
    const engine = { ...createMockEngine(), hooksRegistry: hookRegistry } as AuraRoutingEngine;
    const transaction = createNavigationTransaction({
      engine,
      to: route,
      isStale: () => stale,
      enterRoutes: [route],
      exitRoutes: [],
      transitionOrder: null,
    });

    const pending = dataGraph.load([route], { transaction, mode: 'navigation' });
    await Promise.resolve();
    stale = true;
    release();

    await expect(pending).resolves.toEqual({ error: { status: 'cancelled' } });
  });

  it('surfaces terminal outcomes from the shared load factory', async () => {
    const spy = jest
      .spyOn(DataGraph.prototype as unknown as { callLoadHooks: () => Promise<unknown> }, 'callLoadHooks')
      .mockResolvedValue({ error: { status: 'error', error: new Error('terminal') } });

    try {
      const route = matchedRoute('/terminal');
      route.route.cache = NO_CACHE;
      const { error, data } = await dataGraph.load([route], navOptions(hookRegistry, [route]));

      expect(data).toBeUndefined();
      expect(error).toMatchObject({ status: 'error' });
    } finally {
      spy.mockRestore();
    }
  });

  it('prefetch soft-skips when transaction goes stale after settle', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let stale = false;

    hookRegistry.register({
      name: 'data',
      version: '1.0.0',
      fn: asLoadHook(async () => {
        await gate;
        return { warm: true };
      }),
    });

    const route = matchedRoute('/prefetch-stale');
    route.route.cache = NO_CACHE;
    const engine = { ...createMockEngine(), hooksRegistry: hookRegistry } as AuraRoutingEngine;
    const transaction = createNavigationTransaction({
      engine,
      to: route,
      isStale: () => stale,
      enterRoutes: [route],
      exitRoutes: [],
      transitionOrder: null,
    });

    const pending = dataGraph.load([route], { transaction, mode: 'prefetch' });
    await Promise.resolve();
    stale = true;
    release();

    const result = await pending;
    expect(result.error).toBeUndefined();
    expect(result.data?.get(route.dataKey!)).toBeUndefined();
  });
});

function onAbortOnce(signal: AbortSignal, callback: () => void): void {
  if (signal.aborted) {
    callback();
    return;
  }
  signal.addEventListener('abort', callback, { once: true });
}

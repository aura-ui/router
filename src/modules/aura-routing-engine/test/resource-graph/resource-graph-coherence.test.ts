import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import type { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { DataGraph } from '../../core/data-graph';
import { HookRegistry } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import type { NavigationPhaseMode } from '../../core/navigation/types';
import {
  DEFAULT_HANDOFF_TTL_MS,
  HandoffCache,
  ResourceGraph,
} from '../../core/resource-graph';
import { LoaderRegistry, ViewGraph } from '../../core/view-graph';
import { finalizeTransitionPlan } from '../../core/route-tree/transition-plan';
import {
  createMatchedRoute,
  createMockEngine,
  createMockViewGraph,
} from '../helpers/create-mock-transaction';
import { withResolvedView } from '../helpers/with-resolved-view';

function prepareTx(
  enterRoutes: readonly MatchedRouteInfo[],
  engine: AuraRoutingEngine,
  phaseMode: NavigationPhaseMode,
  update = false,
): NavigationTransaction {
  const to = enterRoutes[enterRoutes.length - 1]!;
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
      phaseMode,
    },
    () => false,
    engine,
  );
  transaction.transitionPlan = finalizeTransitionPlan({
    enterRoutes: [...enterRoutes],
    exitRoutes: [],
    lca: null,
    update,
  });
  return transaction;
}

function createNoCacheRoute(
  path: string,
  overrides: Parameters<typeof createMatchedRoute>[1] = {},
): MatchedRouteInfo {
  return withResolvedView(
    createMatchedRoute(path, {
      view: { loader: 'html', content: `<span>${path}</span>` },
      cache: NO_CACHE,
      ...overrides,
    }),
  );
}

describe('ResourceGraph prepare coherence (E2–E5, E7)', () => {
  let hooks: HookRegistry;
  let handoff: HandoffCache;
  let dataGraph: DataGraph;
  let viewGraph: ViewGraph;
  let resourceGraph: ResourceGraph;
  let engine: AuraRoutingEngine;

  function wire(options: { ttl?: number; viewRegistry?: LoaderRegistry } = {}): void {
    handoff = new HandoffCache(options.ttl !== undefined ? { ttl: options.ttl } : undefined);
    dataGraph = new DataGraph(handoff, { hooks, cache: { staleTime: 60_000 } });
    viewGraph = options.viewRegistry
      ? new ViewGraph(handoff, { registry: options.viewRegistry })
      : createMockViewGraph();
    resourceGraph = new ResourceGraph(viewGraph, dataGraph, handoff);
    engine = {
      ...createMockEngine(),
      hooksRegistry: hooks,
      sharedBuffer: handoff,
      dataGraph,
      viewGraph,
      resourceGraph,
    } as AuraRoutingEngine;
  }

  beforeEach(() => {
    hooks = new HookRegistry();
    wire();
  });

  afterEach(() => {
    dataGraph.destroy();
    handoff.destroy();
    jest.useRealTimers();
  });

  it('E2: settled handoff — prefetch → navigation without cache.* → 1 data + 1 view', async () => {
    let dataLoads = 0;
    let viewLoads = 0;
    const loaders = new LoaderRegistry(undefined, []);
    loaders.register('html', async () => {
      viewLoads++;
      return '<span>users</span>';
    });
    wire({ viewRegistry: loaders });

    hooks.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        dataLoads++;
        return { id: 1 };
      },
    });

    const route = createNoCacheRoute('/users', { load: ['data'] });
    const branch = [route];

    const prefetchTx = prepareTx(branch, engine, 'prefetch');
    await expect(
      resourceGraph.load(branch, { branch, transaction: prefetchTx }),
    ).resolves.toEqual({});

    expect(dataLoads).toBe(1);
    expect(viewLoads).toBe(1);
    // Handoff only — not long `cache.*`.
    expect(dataGraph.getData(route)).toBeUndefined();
    expect(handoff.get(route.dataKey!)).toEqual({ id: 1 });
    expect(handoff.get(route.viewKey!)).toBe('<span>users</span>');

    const navTx = prepareTx(branch, engine, 'navigation');
    const result = await resourceGraph.load(branch, {
      branch,
      transaction: navTx,
    });

    expect(result.error).toBeUndefined();
    expect(dataLoads).toBe(1);
    expect(viewLoads).toBe(1);
    expect(result.data?.get(route.dataKey!)).toEqual({ id: 1 });
    expect(result.view?.[0]).toBe('<span>users</span>');
  });

  it('E2b: in-flight join — navigation overlaps unsettled prefetch (1 data + 1 view)', async () => {
    let dataLoads = 0;
    let viewLoads = 0;
    let releaseData!: () => void;
    let releaseView!: () => void;
    const dataGate = new Promise<void>((resolve) => {
      releaseData = resolve;
    });
    const viewGate = new Promise<void>((resolve) => {
      releaseView = resolve;
    });

    const loaders = new LoaderRegistry(undefined, []);
    loaders.register('html', async () => {
      viewLoads++;
      await viewGate;
      return '<span>overlap</span>';
    });
    wire({ viewRegistry: loaders });

    hooks.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        dataLoads++;
        await dataGate;
        return { id: 2 };
      },
    });

    const route = createNoCacheRoute('/overlap', { load: ['data'] });
    const branch = [route];

    const prefetchTx = prepareTx(branch, engine, 'prefetch');
    const prefetch = resourceGraph.load(branch, { branch, transaction: prefetchTx });

    await Promise.resolve();
    expect(dataLoads).toBe(1);
    expect(viewLoads).toBe(1);

    // Hover still in flight — click joins the same shared work (no cancel).
    const navTx = prepareTx(branch, engine, 'navigation');
    const navigation = resourceGraph.load(branch, { branch, transaction: navTx });

    releaseData();
    releaseView();

    await expect(prefetch).resolves.toEqual({});
    const result = await navigation;

    expect(result.error).toBeUndefined();
    expect(dataLoads).toBe(1);
    expect(viewLoads).toBe(1);
    expect(result.data?.get(route.dataKey!)).toEqual({ id: 2 });
    expect(result.view?.[0]).toBe('<span>overlap</span>');
  });

  it('E3: abort prefetch mid-flight; navigation joins data + view once', async () => {
    let dataLoads = 0;
    let viewLoads = 0;
    let releaseData!: () => void;
    let releaseView!: () => void;
    const dataGate = new Promise<void>((resolve) => {
      releaseData = resolve;
    });
    const viewGate = new Promise<void>((resolve) => {
      releaseView = resolve;
    });

    const loaders = new LoaderRegistry(undefined, []);
    loaders.register('html', async () => {
      viewLoads++;
      await viewGate;
      return '<span>users</span>';
    });
    wire({ viewRegistry: loaders });

    hooks.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        dataLoads++;
        await dataGate;
        return { id: 1 };
      },
    });

    const route = createNoCacheRoute('/users', { load: ['data'] });
    const branch = [route];

    const prefetchTx = prepareTx(branch, engine, 'prefetch');
    const prefetch = resourceGraph.load(branch, {
      branch,
      transaction: prefetchTx,
    });

    await Promise.resolve();
    expect(dataLoads).toBe(1);
    expect(viewLoads).toBe(1);

    prefetchTx.cancel();
    await expect(prefetch).resolves.toEqual({});

    const navTx = prepareTx(branch, engine, 'navigation');
    const navigation = resourceGraph.load(branch, {
      branch,
      transaction: navTx,
    });
    releaseData();
    releaseView();

    const result = await navigation;
    expect(result.error).toBeUndefined();
    expect(dataLoads).toBe(1);
    expect(viewLoads).toBe(1);
    expect(result.data?.get(route.dataKey!)).toEqual({ id: 1 });
    expect(result.view?.[0]).toBe('<span>users</span>');
  });

  it('E4: cache.data on — after handoff clear, revisit hits long cache', async () => {
    let loads = 0;
    hooks.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        loads++;
        return { n: loads };
      },
    });

    const route = createMatchedRoute('/profile', {
      load: ['data'],
      cache: { dom: false, view: false, data: true },
    });
    const branch = [route];

    const firstTx = prepareTx(branch, engine, 'navigation');
    const first = await resourceGraph.load(branch, {
      branch,
      transaction: firstTx,
    });
    expect(first.error).toBeUndefined();
    expect(loads).toBe(1);
    expect(dataGraph.getData(route)).toEqual({ n: 1 });

    // Drop prepare handoff only — long `cache.data` must still serve.
    handoff.clear();
    expect(handoff.get(route.dataKey!)).toBeUndefined();

    const secondTx = prepareTx(branch, engine, 'navigation');
    const second = await resourceGraph.load(branch, {
      branch,
      transaction: secondTx,
    });
    expect(second.error).toBeUndefined();
    expect(loads).toBe(1);
    expect(second.data?.get(route.dataKey!)).toEqual({ n: 1 });
    expect(dataGraph.getData(route)).toEqual({ n: 1 });
  });

  it('E5: cache.* off + handoff TTL expire → second navigation reloads data + view', async () => {
    jest.useFakeTimers();

    let dataLoads = 0;
    let viewLoads = 0;
    const loaders = new LoaderRegistry(undefined, []);
    loaders.register('html', async () => {
      viewLoads++;
      return `<span>${viewLoads}</span>`;
    });
    wire({ viewRegistry: loaders });

    hooks.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        dataLoads++;
        return { n: dataLoads };
      },
    });

    const route = createNoCacheRoute('/ephemeral', { load: ['data'] });
    const branch = [route];

    const firstTx = prepareTx(branch, engine, 'navigation');
    const first = await resourceGraph.load(branch, {
      branch,
      transaction: firstTx,
    });
    expect(first.error).toBeUndefined();
    expect(dataLoads).toBe(1);
    expect(viewLoads).toBe(1);
    expect(dataGraph.getData(route)).toBeUndefined();

    jest.advanceTimersByTime(DEFAULT_HANDOFF_TTL_MS);
    // Still fresh at exactly TTL (gcTime boundary — same as HandoffCache unit test).
    const atTtlTx = prepareTx(branch, engine, 'navigation');
    await resourceGraph.load(branch, { branch, transaction: atTtlTx });
    expect(dataLoads).toBe(1);
    expect(viewLoads).toBe(1);

    jest.advanceTimersByTime(1);

    const secondTx = prepareTx(branch, engine, 'navigation');
    const second = await resourceGraph.load(branch, {
      branch,
      transaction: secondTx,
    });
    expect(second.error).toBeUndefined();
    expect(dataLoads).toBe(2);
    expect(viewLoads).toBe(2);
    expect(second.data?.get(route.dataKey!)).toEqual({ n: 2 });
    expect(second.view?.[0]).toBe('<span>2</span>');
  });

  it('E7: update path joins the same prepare handoff (1 data load)', async () => {
    let loads = 0;
    hooks.register({
      name: 'data',
      version: '1.0.0',
      fn: async () => {
        loads++;
        return { id: 7 };
      },
    });

    const route = createMatchedRoute('/settings', {
      load: ['data'],
      update: ['sync'],
      cache: NO_CACHE,
    });
    const branch = [route];

    expect(engine.sharedBuffer).toBe(handoff);
    expect(engine.resourceGraph).toBe(resourceGraph);

    const prefetchTx = prepareTx(branch, engine, 'prefetch');
    await expect(
      resourceGraph.load(branch, { branch, transaction: prefetchTx }),
    ).resolves.toEqual({});
    expect(loads).toBe(1);
    expect(dataGraph.getData(route)).toBeUndefined();
    expect(handoff.get(route.dataKey!)).toEqual({ id: 7 });

    const updateTx = prepareTx(branch, engine, 'navigation', true);
    expect(updateTx.engine.sharedBuffer).toBe(handoff);
    const result = await new NavigationTransactionPipeline(updateTx).runUpdate();

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(loads).toBe(1);
    expect(updateTx.dataSnapshot?.get(route.dataKey!)).toEqual({ id: 7 });
  });
});

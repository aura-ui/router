import { DataGraph } from '../../core/data-graph';
import { HookRegistry } from '../../core/hooks/registry';
import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import { PrefetchPipeline } from '../../core/prefetch/pipeline';
import {
  DataPrefetchExecutor,
  DefaultPrefetchResourcePlanner,
  PrefetchResourceScheduler,
} from '../../core/prefetch/resources';
import type {
  PrefetchConfig,
  PrefetchPlan,
  PrefetchResource,
  PrefetchResourceExecutor,
  PrefetchResourcePlanner,
} from '../../core/prefetch/types';
import { buildTreeFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('PrefetchPipeline', () => {
  const matcher = new AuraRoutingUrlMatcher();

  function pageMatchableNodes() {
    const page = createDomRoute('/page');
    page.setAttribute('view', 'html::x');
    return buildTreeFromDom(page).matchableNodes;
  }

  function createPipeline(overrides: {
    planner?: PrefetchResourcePlanner;
    executors?: PrefetchResourceExecutor[];
    currentHref?: string;
    config?: Partial<PrefetchConfig>;
  } = {}) {
    const profile = createDomRoute('profile');
    profile.setAttribute('view', 'html::profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const planner = overrides.planner ?? new DefaultPrefetchResourcePlanner();

    const executors = overrides.executors ?? [
      {
        kind: 'view',
        run: async () => {},
      },
      {
        kind: 'data',
        run: async () => {},
      },
    ];

    return {
      pipeline: new PrefetchPipeline(
        {
          matcher,
          getMatchableNodes: () => matchableNodes,
          getRegistryGeneration: () => 1,
          planner,
          scheduler: new PrefetchResourceScheduler(executors),
        },
        {
          currentHref: () => overrides.currentHref ?? '',
          ...overrides.config,
        },
      ),
      matchableNodes,
    };
  }

  beforeEach(() => {
    matcher.destroy();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prefetch plans resources and runs kind executors in parallel', async () => {
    const order: string[] = [];
    const { pipeline } = createPipeline({
      planner: {
        planResources: (plan) => [
          { kind: 'view', targets: plan.enterRoutes, priority: 'high' },
          { kind: 'data', targets: plan.enterRoutes, priority: 'high' },
        ],
      },
      executors: [
        {
          kind: 'view',
          run: async (resource) => {
            order.push(`view:${resource.targets.at(-1)?.pattern}`);
          },
        },
        {
          kind: 'data',
          run: async (resource) => {
            order.push(`data:${resource.targets.at(-1)?.pattern}`);
          },
        },
      ],
    });

    await pipeline.prefetch('/settings/profile');

    expect(order).toHaveLength(2);
    expect(order).toContain('view:/settings/profile');
    expect(order).toContain('data:/settings/profile');
  });

  it('completes when planned resources have no matching executor', async () => {
    const { pipeline } = createPipeline({
      planner: {
        planResources: (plan) => [{ kind: 'data', targets: plan.enterRoutes, priority: 'high' }],
      },
      executors: [],
    });

    await expect(pipeline.prefetch('/settings/profile')).resolves.toBeUndefined();
  });

  it('runs DataPrefetchExecutor when data resource is planned', async () => {
    let dataRuns = 0;
    const profile = createDomRoute('profile');
    profile.setAttribute('load', 'profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const pipeline = new PrefetchPipeline(
      {
        matcher,
        getMatchableNodes: () => matchableNodes,
        getRegistryGeneration: () => 1,
        planner: new DefaultPrefetchResourcePlanner({ view: false }),
        scheduler: new PrefetchResourceScheduler([
          {
            kind: 'data',
            run: async () => {
              dataRuns++;
            },
          },
        ]),
      },
      {},
    );

    await pipeline.prefetch('/settings/profile', { mode: 'intent' });

    expect(dataRuns).toBe(1);
  });

  it('DataPrefetchExecutor warms load-hook cache', async () => {
    const hookRegistry = new HookRegistry();
    let loads = 0;
    hookRegistry.register({
      name: 'profile',
      version: '1.0.0',
      fn: async () => {
        loads++;
      },
    });

    const profile = createDomRoute('profile');
    profile.setAttribute('load', 'profile');
    profile.setAttribute('preserve', 'data');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);
    const matcher = new AuraRoutingUrlMatcher();
    const match = matcher.matchPath('/settings/profile', matchableNodes);
    expect(match).not.toBeNull();

    const dataGraph = new DataGraph(hookRegistry);
    const executor = new DataPrefetchExecutor(dataGraph);

    const leaf = matcher.toRouteInfo(
      '/settings/profile',
      '/settings/profile',
      '',
      '',
      match!.node,
      match!.params,
    );

    await executor.run(
      { kind: 'data', targets: [leaf], priority: 'high' },
      { signal: new AbortController().signal, mode: 'intent', confidence: 1 },
    );

    expect(loads).toBe(1);

    await executor.run(
      { kind: 'data', targets: [leaf], priority: 'high' },
      { signal: new AbortController().signal, mode: 'intent', confidence: 1 },
    );

    expect(loads).toBe(1);
    dataGraph.destroy();
  });

  it('scheduleIntent waits for delay then prefetches', async () => {
    const runs: PrefetchResource[] = [];
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async (resource) => {
            runs.push(resource);
          },
        },
      ],
    });

    pipeline.scheduleIntent('/settings/profile', 'intent');
    expect(runs).toHaveLength(0);

    jest.advanceTimersByTime(49);
    expect(runs).toHaveLength(0);

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(runs).toHaveLength(0);
  });

  it('tap mode prefetches content resources', async () => {
    const runs: PrefetchPlan[] = [];
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async (resource) => {
            runs.push({
              href: resource.targets.at(-1)?.href ?? '',
            } as PrefetchPlan);
          },
        },
      ],
    });

    await pipeline.prefetch('/settings/profile', { mode: 'tap' });

    expect(runs).toHaveLength(1);
  });

  it('cancelIntent aborts scheduled and in-flight prefetch', async () => {
    let aborted = false;
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async (_resource, ctx) => {
            await new Promise<void>((resolve, reject) => {
              ctx.signal.addEventListener('abort', () => {
                aborted = true;
                reject(new DOMException('aborted', 'AbortError'));
              });
              setTimeout(resolve, 100);
            });
          },
        },
      ],
    });

    const pending = pipeline.prefetch('/settings/profile', { mode: 'tap' });
    pipeline.cancelIntent('/settings/profile');

    await pending.catch(() => undefined);
    expect(aborted).toBe(true);
  });

  it('dedupes in-flight prefetch for the same href', async () => {
    let loads = 0;
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async () => {
            loads++;
            await new Promise((resolve) => setTimeout(resolve, 50));
          },
        },
      ],
    });

    const first = pipeline.prefetch('/settings/profile', { mode: 'tap' });
    const second = pipeline.prefetch('/settings/profile', { mode: 'tap' });

    jest.advanceTimersByTime(50);
    await Promise.all([first, second]);

    expect(loads).toBe(1);
  });

  it('skips repeat prefetch within staleTime', async () => {
    let loads = 0;
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async () => {
            loads++;
          },
        },
      ],
    });

    await pipeline.prefetch('/settings/profile', { mode: 'tap' });
    await pipeline.prefetch('/settings/profile', { mode: 'tap' });

    expect(loads).toBe(1);
  });

  it('skips hash-only href changes', async () => {
    const skipped: string[] = [];
    const matchableNodes = pageMatchableNodes();
    const pipeline = new PrefetchPipeline(
      {
        matcher,
        getMatchableNodes: () => matchableNodes,
        getRegistryGeneration: () => 1,
        planner: new DefaultPrefetchResourcePlanner(),
        scheduler: new PrefetchResourceScheduler([{ kind: 'view', run: async () => {} }]),
      },
      {
        currentHref: () => '/page#tab',
        onSkipped: (_href, reason) => skipped.push(reason),
      },
    );

    await pipeline.prefetch('/page#other');

    expect(skipped).toContain('hash-only');
  });

  it('skips when mode is none', async () => {
    let loads = 0;
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async () => {
            loads++;
          },
        },
      ],
    });

    pipeline.scheduleIntent('/settings/profile', 'none');
    jest.runAllTimers();
    await Promise.resolve();

    expect(loads).toBe(0);
  });

  it('does not record stale skip when no resources are produced', async () => {
    const page = createDomRoute('/page');
    page.setAttribute('view', 'html::x');
    const { matchableNodes } = buildTreeFromDom(page);

    let loads = 0;
    const withContent = new PrefetchPipeline({
      matcher,
      getMatchableNodes: () => matchableNodes,
      getRegistryGeneration: () => 1,
      planner: new DefaultPrefetchResourcePlanner(),
      scheduler: new PrefetchResourceScheduler([
        {
          kind: 'view',
          run: async () => {
            loads++;
          },
        },
      ]),
    });

    const noop = new PrefetchPipeline({
      matcher,
      getMatchableNodes: () => matchableNodes,
      getRegistryGeneration: () => 1,
      planner: { planResources: () => [] },
      scheduler: new PrefetchResourceScheduler([]),
    });
    await noop.prefetch('/page', { mode: 'intent' });

    await withContent.prefetch('/page', { mode: 'tap' });

    expect(loads).toBe(1);
  });

  it('allows prefetch to same page with hash when current location has no hash', async () => {
    const skipped: string[] = [];
    const runs: string[] = [];
    const matchableNodes = pageMatchableNodes();
    const pipeline = new PrefetchPipeline(
      {
        matcher,
        getMatchableNodes: () => matchableNodes,
        getRegistryGeneration: () => 1,
        planner: new DefaultPrefetchResourcePlanner(),
        scheduler: new PrefetchResourceScheduler([
          {
            kind: 'view',
            run: async (resource) => {
              runs.push(resource.targets[0]?.href ?? '');
            },
          },
        ]),
      },
      {
        currentHref: () => '/page',
        onSkipped: (_href, reason) => skipped.push(reason),
      },
    );

    await pipeline.prefetch('/page#section', { mode: 'tap' });

    expect(skipped).not.toContain('hash-only');
    expect(runs).toEqual(['/page#section']);
  });

  it('does not record fresh state after aborted prefetch', async () => {
    let loads = 0;
    let hang = true;
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async () => {
            loads++;
            if (hang) await new Promise<void>(() => {});
          },
        },
      ],
    });

    const pending = pipeline.prefetch('/settings/profile', { mode: 'tap' });
    pipeline.cancelIntent('/settings/profile');
    await pending;

    hang = false;
    await pipeline.prefetch('/settings/profile', { mode: 'tap' });

    expect(loads).toBe(2);
  });

  it('skips content on intent with low-confidence reason', async () => {
    const skipped: string[] = [];
    const { pipeline } = createPipeline({
      config: {
        onSkipped: (_href, reason) => skipped.push(reason),
      },
    });

    await pipeline.prefetch('/settings/profile', { mode: 'intent' });

    expect(skipped).toContain('low-confidence');
  });

  it('skips prefetch when route does not match', async () => {
    const skipped: string[] = [];
    const { pipeline } = createPipeline({
      config: {
        onSkipped: (_href, reason) => skipped.push(reason),
      },
    });

    await pipeline.prefetch('/missing', { mode: 'manual' });

    expect(skipped).toContain('no-match');
  });

  it('force aborts in-flight prefetch and starts a new run', async () => {
    let loads = 0;
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async (_resource, ctx) => {
            loads++;
            await new Promise<void>((resolve, reject) => {
              ctx.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
              setTimeout(resolve, 100);
            });
          },
        },
      ],
    });

    const first = pipeline.prefetch('/settings/profile', { mode: 'tap' });
    const second = pipeline.prefetch('/settings/profile', { mode: 'tap', force: true });

    jest.advanceTimersByTime(100);
    await Promise.allSettled([first, second]);

    expect(loads).toBe(2);
  });

  it('invokes onError when prefetch load fails', async () => {
    const errors: unknown[] = [];
    const { pipeline } = createPipeline({
      config: {
        onError: (_plan, error) => errors.push(error),
      },
      executors: [
        {
          kind: 'view',
          run: async () => {
            throw new Error('load failed');
          },
        },
      ],
    });

    await pipeline.prefetch('/settings/profile', { mode: 'tap' });

    expect(errors[0]).toEqual(expect.objectContaining({ message: 'load failed' }));
  });

  it('rethrows load errors for manual prefetch', async () => {
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async () => {
            throw new Error('load failed');
          },
        },
      ],
    });

    await expect(pipeline.prefetch('/settings/profile', { mode: 'manual' })).rejects.toThrow(
      'load failed',
    );
  });

  it('reports lifecycle callbacks and speculation hints', async () => {
    const started: string[] = [];
    const completed: string[] = [];
    const hinted: string[] = [];
    const intents: string[] = [];

    const { pipeline, matchableNodes } = createPipeline({
      config: {
        onStart: (plan) => started.push(plan.href),
        onComplete: (plan) => completed.push(plan.href),
        onIntent: (intent) => intents.push(intent.type),
      },
      executors: [{ kind: 'view', run: async () => {} }],
    });

    const withSpeculation = new PrefetchPipeline(
      {
        matcher,
        getMatchableNodes: () => matchableNodes,
        getRegistryGeneration: () => 1,
        planner: new DefaultPrefetchResourcePlanner(),
        scheduler: new PrefetchResourceScheduler([{ kind: 'view', run: async () => {} }]),
        speculation: {
          hint: (plan) => hinted.push(plan.href),
        },
      },
      {},
    );

    pipeline.scheduleIntent('/settings/profile', 'tap');
    jest.runAllTimers();
    await Promise.resolve();

    await withSpeculation.prefetch('/settings/profile', { mode: 'tap' });

    expect(started).toContain('/settings/profile');
    expect(completed).toContain('/settings/profile');
    expect(intents).toContain('schedule');
    expect(hinted).toContain('/settings/profile');
  });

  it('reports scheduled state while intent debounce is pending', () => {
    const { pipeline } = createPipeline();

    pipeline.scheduleIntent('/settings/profile', 'intent');
    expect(pipeline.isScheduled('/settings/profile')).toBe(true);

    jest.advanceTimersByTime(50);
    expect(pipeline.isScheduled('/settings/profile')).toBe(false);
  });

  it('reports inflight state while prefetch run is active', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async () => {
            await gate;
          },
        },
      ],
    });

    const pending = pipeline.prefetch('/settings/profile', { mode: 'tap' });
    expect(pipeline.isInflight('/settings/profile')).toBe(true);

    release?.();
    await pending;

    expect(pipeline.isInflight('/settings/profile')).toBe(false);
  });

  it('start wires link intents into the pipeline bus', () => {
    const intents: string[] = [];
    const { pipeline } = createPipeline({
      config: {
        onIntent: (intent) => intents.push(intent.type),
      },
    });

    pipeline.start();
    document.body.innerHTML = '<a href="/settings/profile" data-router-link>Profile</a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(intents).toContain('schedule');
    pipeline.destroy();
  });

  it('aborts when external signal is aborted', async () => {
    let aborted = false;
    const external = new AbortController();
    const { pipeline } = createPipeline({
      executors: [
        {
          kind: 'view',
          run: async (_resource, ctx) => {
            await new Promise<void>((resolve, reject) => {
              ctx.signal.addEventListener('abort', () => {
                aborted = true;
                reject(new DOMException('aborted', 'AbortError'));
              });
            });
          },
        },
      ],
    });

    const pending = pipeline.prefetch('/settings/profile', {
      mode: 'tap',
      signal: external.signal,
    });
    external.abort();
    await pending.catch(() => undefined);

    expect(aborted).toBe(true);
  });

  it('destroy stops further intent handling', () => {
    const { pipeline } = createPipeline();
    pipeline.destroy();

    expect(() => pipeline.scheduleIntent('/settings/profile')).not.toThrow();
  });

  it('exposes intent bus for external subscribers', () => {
    const { pipeline } = createPipeline();
    const listener = jest.fn();

    pipeline.intent.subscribe(listener);
    pipeline.intent.emit({
      type: 'schedule',
      href: '/settings/profile',
      mode: 'tap',
      source: 'test',
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'schedule', href: '/settings/profile' }),
    );
    pipeline.destroy();
  });

  it('ignores invalid hrefs in scheduleIntent', async () => {
    const skipped: string[] = [];
    const { pipeline } = createPipeline({
      config: {
        onSkipped: (_href, reason) => skipped.push(reason),
      },
    });

    pipeline.scheduleIntent('https://example.com', 'tap');
    jest.runAllTimers();
    await Promise.resolve();

    expect(skipped).toContain('invalid-href');
  });
});

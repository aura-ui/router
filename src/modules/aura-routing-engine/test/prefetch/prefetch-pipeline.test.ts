import { DataGraph } from '../../core/data-graph';
import { HookRegistry } from '../../core/hooks/registry';
import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import { PrefetchPipeline } from '../../core/prefetch/pipeline';
import { DefaultPrefetchResourcePlanner } from '../../core/prefetch/resources';
import type {
  PrefetchConfig,
  PrefetchPipelineDeps,
  PrefetchResourcePlanner,
  SpeculationPrefetchPort,
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
    runSpeculativePrepare?: PrefetchPipelineDeps['runSpeculativePrepare'];
    currentHref?: string;
    config?: Partial<PrefetchConfig>;
    speculation?: SpeculationPrefetchPort;
    matchableNodes?: ReturnType<typeof buildTreeFromDom>['matchableNodes'];
  } = {}) {
    const profile = createDomRoute('profile');
    profile.setAttribute('view', 'html::profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes: defaultNodes } = buildTreeFromDom(settings);
    const matchableNodes = overrides.matchableNodes ?? defaultNodes;

    const planner = overrides.planner ?? new DefaultPrefetchResourcePlanner();
    const runSpeculativePrepare =
      overrides.runSpeculativePrepare ?? jest.fn().mockResolvedValue(undefined);

    return {
      pipeline: new PrefetchPipeline(
        {
          matcher,
          getMatchableNodes: () => matchableNodes,
          getRegistryGeneration: () => 1,
          planner,
          runSpeculativePrepare,
          speculation: overrides.speculation,
        },
        {
          currentHref: () => overrides.currentHref ?? '',
          ...overrides.config,
        },
      ),
      runSpeculativePrepare,
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

  it('prefetch plans resources and runs speculative prepare with data+view flags', async () => {
    const order: string[] = [];
    const { pipeline } = createPipeline({
      planner: {
        planResources: (plan) => [
          { kind: 'view', targets: plan.enterRoutes, priority: 'high' },
          { kind: 'data', targets: plan.enterRoutes, priority: 'high' },
        ],
      },
      runSpeculativePrepare: async (plan, ctx) => {
        if (ctx.view) order.push(`view:${plan.enterRoutes.at(-1)?.pattern}`);
        if (ctx.data) order.push(`data:${plan.enterRoutes.at(-1)?.pattern}`);
      },
    });

    await pipeline.prefetch('/settings/profile');

    expect(order).toHaveLength(2);
    expect(order).toContain('view:/settings/profile');
    expect(order).toContain('data:/settings/profile');
  });

  it('completes when speculative prepare is a no-op', async () => {
    const { pipeline } = createPipeline({
      planner: {
        planResources: (plan) => [{ kind: 'data', targets: plan.enterRoutes, priority: 'high' }],
      },
      runSpeculativePrepare: async () => undefined,
    });

    await expect(pipeline.prefetch('/settings/profile')).resolves.toBeUndefined();
  });

  it('runs speculative prepare for data when data resource is planned', async () => {
    let dataRuns = 0;
    const profile = createDomRoute('profile');
    profile.setAttribute('load', 'profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    const { pipeline } = createPipeline({
      matchableNodes,
      planner: new DefaultPrefetchResourcePlanner({ view: false }),
      runSpeculativePrepare: async (_plan, ctx) => {
        if (ctx.data) dataRuns++;
      },
    });

    await pipeline.prefetch('/settings/profile', { mode: 'intent' });

    expect(dataRuns).toBe(1);
  });

  it('DataGraph.prefetch warms load-hook cache', async () => {
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
    profile.setAttribute('cache', 'data');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);
    const localMatcher = new AuraRoutingUrlMatcher();
    const match = localMatcher.matchPath('/settings/profile', matchableNodes);
    expect(match).not.toBeNull();

    const dataGraph = new DataGraph(hookRegistry);

    const leaf = localMatcher.toRouteInfo(
      '/settings/profile',
      '/settings/profile',
      '',
      '',
      match!.node,
      match!.params,
    );

    const signal = new AbortController().signal;
    await dataGraph.prefetch([leaf], { signal, mode: 'intent' });
    expect(loads).toBe(1);

    await dataGraph.prefetch([leaf], { signal, mode: 'intent' });
    expect(loads).toBe(1);

    dataGraph.destroy();
    localMatcher.destroy();
  });

  it('scheduleIntent waits for delay then prefetches', async () => {
    const { pipeline, runSpeculativePrepare } = createPipeline();

    pipeline.scheduleIntent('/settings/profile', 'intent');
    expect(runSpeculativePrepare).not.toHaveBeenCalled();

    jest.advanceTimersByTime(49);
    expect(runSpeculativePrepare).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();

    // intent → low confidence → view-only routes skip prepare
    expect(runSpeculativePrepare).not.toHaveBeenCalled();
  });

  it('tap mode prefetches content resources', async () => {
    const runs: string[] = [];
    const { pipeline } = createPipeline({
      runSpeculativePrepare: async (plan, ctx) => {
        if (ctx.view) runs.push(plan.href);
      },
    });

    await pipeline.prefetch('/settings/profile', { mode: 'tap' });

    expect(runs).toHaveLength(1);
  });

  it('cancelIntent aborts scheduled and in-flight prefetch', async () => {
    let aborted = false;
    const { pipeline } = createPipeline({
      runSpeculativePrepare: async (_plan, ctx) => {
        await new Promise<void>((resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
          setTimeout(resolve, 100);
        });
      },
    });

    const pending = pipeline.prefetch('/settings/profile', { mode: 'tap' });
    pipeline.cancelIntent('/settings/profile');

    await pending.catch(() => undefined);
    expect(aborted).toBe(true);
  });

  it('dedupes in-flight prefetch for the same href', async () => {
    let loads = 0;
    const { pipeline } = createPipeline({
      runSpeculativePrepare: async () => {
        loads++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
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
      runSpeculativePrepare: async () => {
        loads++;
      },
    });

    await pipeline.prefetch('/settings/profile', { mode: 'tap' });
    await pipeline.prefetch('/settings/profile', { mode: 'tap' });

    expect(loads).toBe(1);
  });

  it('skips hash-only href changes', async () => {
    const skipped: string[] = [];
    const matchableNodes = pageMatchableNodes();
    const { pipeline } = createPipeline({
      matchableNodes,
      currentHref: '/page#tab',
      config: {
        onSkipped: (_href, reason) => skipped.push(reason),
      },
    });

    await pipeline.prefetch('/page#other');

    expect(skipped).toContain('hash-only');
  });

  it('skips when mode is none', async () => {
    const { pipeline, runSpeculativePrepare } = createPipeline();

    pipeline.scheduleIntent('/settings/profile', 'none');
    jest.runAllTimers();
    await Promise.resolve();

    expect(runSpeculativePrepare).not.toHaveBeenCalled();
  });

  it('does not record stale skip when no resources are produced', async () => {
    const page = createDomRoute('/page');
    page.setAttribute('view', 'html::x');
    const { matchableNodes } = buildTreeFromDom(page);

    let loads = 0;
    const { pipeline: withContent } = createPipeline({
      matchableNodes,
      runSpeculativePrepare: async (_plan, ctx) => {
        if (ctx.view) loads++;
      },
    });

    const { pipeline: noop } = createPipeline({
      matchableNodes,
      planner: { planResources: () => [] },
    });
    await noop.prefetch('/page', { mode: 'intent' });

    await withContent.prefetch('/page', { mode: 'tap' });

    expect(loads).toBe(1);
  });

  it('allows prefetch to same page with hash when current location has no hash', async () => {
    const skipped: string[] = [];
    const runs: string[] = [];
    const matchableNodes = pageMatchableNodes();
    const { pipeline } = createPipeline({
      matchableNodes,
      currentHref: '/page',
      config: {
        onSkipped: (_href, reason) => skipped.push(reason),
      },
      runSpeculativePrepare: async (plan, ctx) => {
        if (ctx.view) runs.push(plan.href);
      },
    });

    await pipeline.prefetch('/page#section', { mode: 'tap' });

    expect(skipped).not.toContain('hash-only');
    expect(runs).toEqual(['/page#section']);
  });

  it('does not record fresh state after aborted prefetch', async () => {
    let loads = 0;
    let hang = true;
    const { pipeline } = createPipeline({
      runSpeculativePrepare: async (_plan, ctx) => {
        loads++;
        if (!hang) return;
        await new Promise<void>((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      },
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
      runSpeculativePrepare: async (_plan, ctx) => {
        loads++;
        await new Promise<void>((resolve, reject) => {
          ctx.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          setTimeout(resolve, 100);
        });
      },
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
      runSpeculativePrepare: async () => {
        throw new Error('load failed');
      },
    });

    await pipeline.prefetch('/settings/profile', { mode: 'tap' });

    expect(errors[0]).toEqual(expect.objectContaining({ message: 'load failed' }));
  });

  it('rethrows load errors for manual prefetch', async () => {
    const { pipeline } = createPipeline({
      runSpeculativePrepare: async () => {
        throw new Error('load failed');
      },
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

    const { pipeline } = createPipeline({
      config: {
        onStart: (plan) => started.push(plan.href),
        onComplete: (plan) => completed.push(plan.href),
        onIntent: (intent) => intents.push(intent.type),
      },
    });

    const { pipeline: withSpeculation } = createPipeline({
      speculation: {
        hint: (plan) => hinted.push(plan.href),
      },
    });

    pipeline.scheduleIntent('/settings/profile', 'tap');
    jest.runAllTimers();
    await Promise.resolve();
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
      runSpeculativePrepare: async () => {
        await gate;
      },
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
      runSpeculativePrepare: async (_plan, ctx) => {
        await new Promise<void>((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      },
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

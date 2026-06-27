import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import { PrefetchPipeline } from '../../core/prefetch';
import type { PrefetchExecutor, PrefetchPlan } from '../../core/prefetch';
import { buildTreeFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('PrefetchPipeline', () => {
  const matcher = new AuraRoutingUrlMatcher();

  function createPipeline(overrides: {
    executors?: PrefetchExecutor[];
    currentHref?: string;
  } = {}) {
    const profile = createDomRoute('profile');
    const settings = createDomRoute('/settings', [profile]);
    const { matchableNodes } = buildTreeFromDom(settings);

    return {
      pipeline: new PrefetchPipeline(
        {
          matcher,
          getMatchableNodes: () => matchableNodes,
          getRegistryGeneration: () => 1,
          executors: overrides.executors ?? [],
        },
        { currentHref: () => overrides.currentHref ?? '' },
      ),
      matchableNodes,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prefetch resolves branch and runs executors in parallel', async () => {
    const order: string[] = [];
    const content: PrefetchExecutor = {
      id: 'content',
      run: async (plan) => {
        order.push(`content:${plan.leaf.pattern}`);
      },
    };
    const data: PrefetchExecutor = {
      id: 'data',
      run: async (plan) => {
        order.push(`data:${plan.leaf.pattern}`);
      },
    };

    const { pipeline } = createPipeline({ executors: [content, data] });
    await pipeline.prefetch('/settings/profile');

    expect(order).toHaveLength(2);
    expect(order).toContain('content:/settings/profile');
    expect(order).toContain('data:/settings/profile');
  });

  it('scheduleIntent waits for delay then prefetches', async () => {
    const runs: PrefetchPlan[] = [];
    const { pipeline } = createPipeline({
      executors: [
        {
          id: 'content',
          run: async (plan) => {
            runs.push(plan);
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

    expect(runs).toHaveLength(1);
    expect(runs[0]?.leaf.pattern).toBe('/settings/profile');
    expect(runs[0]?.chain.map((entry) => entry.pattern)).toEqual(['/settings', '/settings/profile']);
  });

  it('cancelIntent aborts scheduled and in-flight prefetch', async () => {
    let aborted = false;
    const { pipeline } = createPipeline({
      executors: [
        {
          id: 'content',
          run: async (_plan, ctx) => {
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

    const pending = pipeline.prefetch('/settings/profile');
    pipeline.cancelIntent('/settings/profile');

    await pending.catch(() => undefined);
    expect(aborted).toBe(true);
  });

  it('dedupes in-flight prefetch for the same href', async () => {
    let loads = 0;
    const { pipeline } = createPipeline({
      executors: [
        {
          id: 'content',
          run: async () => {
            loads++;
            await new Promise((resolve) => setTimeout(resolve, 50));
          },
        },
      ],
    });

    const first = pipeline.prefetch('/settings/profile');
    const second = pipeline.prefetch('/settings/profile');

    jest.advanceTimersByTime(50);
    await Promise.all([first, second]);

    expect(loads).toBe(1);
  });

  it('skips repeat prefetch within staleTime', async () => {
    let loads = 0;
    const { pipeline } = createPipeline({
      executors: [
        {
          id: 'content',
          run: async () => {
            loads++;
          },
        },
      ],
    });

    await pipeline.prefetch('/settings/profile');
    await pipeline.prefetch('/settings/profile');

    expect(loads).toBe(1);
  });

  it('skips hash-only href changes', async () => {
    const skipped: string[] = [];
    const pipeline = new PrefetchPipeline(
      {
        matcher,
        getMatchableNodes: () => buildTreeFromDom(createDomRoute('/page')).matchableNodes,
        getRegistryGeneration: () => 1,
        executors: [{ id: 'content', run: async () => {} }],
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
          id: 'content',
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

  it('does not record stale skip when no executors are configured', async () => {
    const page = createDomRoute('/page');
    const { matchableNodes } = buildTreeFromDom(page);

    let loads = 0;
    const withContent = new PrefetchPipeline({
      matcher,
      getMatchableNodes: () => matchableNodes,
      getRegistryGeneration: () => 1,
      executors: [
        {
          id: 'content',
          run: async () => {
            loads++;
          },
        },
      ],
    });

    const noop = new PrefetchPipeline({
      matcher,
      getMatchableNodes: () => matchableNodes,
      getRegistryGeneration: () => 1,
      executors: [],
    });
    await noop.prefetch('/page');

    await withContent.prefetch('/page');

    expect(loads).toBe(1);
  });

  it('allows prefetch to same page with hash when current location has no hash', async () => {
    const skipped: string[] = [];
    const runs: string[] = [];
    const pipeline = new PrefetchPipeline(
      {
        matcher,
        getMatchableNodes: () => buildTreeFromDom(createDomRoute('/page')).matchableNodes,
        getRegistryGeneration: () => 1,
        executors: [
          {
            id: 'content',
            run: async (plan) => {
              runs.push(plan.href);
            },
          },
        ],
      },
      {
        currentHref: () => '/page',
        onSkipped: (_href, reason) => skipped.push(reason),
      },
    );

    await pipeline.prefetch('/page#section');

    expect(skipped).not.toContain('hash-only');
    expect(runs).toEqual(['/page#section']);
  });

  it('does not record fresh state after aborted prefetch', async () => {
    let loads = 0;
    let hang = true;
    const { pipeline } = createPipeline({
      executors: [
        {
          id: 'content',
          run: async () => {
            loads++;
            if (hang) await new Promise<void>(() => {});
          },
        },
      ],
    });

    const pending = pipeline.prefetch('/settings/profile');
    pipeline.cancelIntent('/settings/profile');
    await pending;

    hang = false;
    await pipeline.prefetch('/settings/profile');

    expect(loads).toBe(2);
  });
});

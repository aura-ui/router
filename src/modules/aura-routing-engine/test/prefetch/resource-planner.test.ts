import { AuraRoutingUrlMatcher } from '../../core/match/url-matcher';
import type { ViewGraph } from '../../core/view-graph';
import { PrefetchPolicy } from '../../core/prefetch/policy';
import {
  ViewPrefetchExecutor,
  DefaultPrefetchResourcePlanner,
  PrefetchResourceScheduler,
} from '../../core/prefetch/resources';
import type { PrefetchPlan } from '../../core/prefetch/types';
import { buildTreeFromDom, createDomRoute } from '../helpers/test-route-dom';

describe('DefaultPrefetchResourcePlanner', () => {
  const matcher = new AuraRoutingUrlMatcher();
  const policy = new PrefetchPolicy();
  const planner = new DefaultPrefetchResourcePlanner({}, policy);

  beforeEach(() => {
    matcher.destroy();
  });

  function createPlan(attrs: { view?: string; load?: string; redirect?: string } = {}): PrefetchPlan {
    const page = createDomRoute('/page');
    if (attrs.redirect) {
      page.removeAttribute('view');
      page.setAttribute('redirect', attrs.redirect);
    } else {
      page.setAttribute('view', attrs.view ?? 'html::x');
      if (attrs.load) page.setAttribute('load', attrs.load);
    }
    const { matchableNodes } = buildTreeFromDom(page);
    const found = matcher.matchPath('/page', matchableNodes);
    if (!found) throw new Error('route not found');

    const routeInfo = matcher.toRouteInfo('/page', '/page', '', '', found.node, found.params);

    return {
      href: '/page',
      pathname: '/page',
      search: '',
      hash: '',
      leaf: routeInfo,
      chain: [routeInfo],
      enterRoutes: [routeInfo],
      lca: null,
      registryGeneration: 1,
    };
  }

  it('returns no content resources on intent (low confidence)', () => {
    const planCtx = { mode: 'intent' as const, confidence: policy.confidenceFor('intent') };
    const resources = planner.planResources(createPlan(), planCtx);

    expect(resources).toHaveLength(0);
    expect(planner.explainEmptyPlan(createPlan(), planCtx)).toBe('low-confidence');
  });

  it('returns content resources on tap', () => {
    const resources = planner.planResources(createPlan(), {
      mode: 'tap',
      confidence: policy.confidenceFor('tap'),
    });

    expect(resources).toHaveLength(1);
    expect(resources[0]?.kind).toBe('view');
    expect(resources[0]?.targets).toHaveLength(1);
    expect(resources[0]?.priority).toBe('high');
  });

  it('assigns normal priority to manual content below high-confidence threshold', () => {
    const resources = planner.planResources(createPlan(), {
      mode: 'manual',
      confidence: 0.5,
    });

    expect(resources[0]?.priority).toBe('normal');
  });

  it('keeps data resources for routes with load hooks', () => {
    const resources = planner.planResources(createPlan({ load: 'profile' }), {
      mode: 'intent',
      confidence: policy.confidenceFor('intent'),
    });

    expect(resources).toHaveLength(1);
    expect(resources[0]?.kind).toBe('data');
    expect(resources[0]?.targets).toHaveLength(1);
  });

  it('explainEmptyPlan reports no-targets when route has no view or load hooks', () => {
    const planCtx = { mode: 'tap' as const, confidence: policy.confidenceFor('tap') };
    const emptyPlan = createPlan({ redirect: '/home' });

    expect(planner.planResources(emptyPlan, planCtx)).toHaveLength(0);
    expect(planner.explainEmptyPlan(emptyPlan, planCtx)).toBe('no-targets');
  });

  it('explainEmptyPlan reports low-confidence for data below threshold', () => {
    const plan = createPlan({ load: 'profile' });
    const planCtx = { mode: 'none' as const, confidence: policy.confidenceFor('none') };

    expect(planner.explainEmptyPlan(plan, planCtx)).toBe('low-confidence');
  });

  it('plans content for layout folder routes', () => {
    const child = createDomRoute('detail');
    const page = createDomRoute('/layout-page', [child]);
    const { matchableNodes } = buildTreeFromDom(page);
    const found = matcher.matchPath('/layout-page', matchableNodes);
    if (!found) throw new Error('route not found');

    const routeInfo = matcher.toRouteInfo(
      '/layout-page',
      '/layout-page',
      '',
      '',
      found.node,
      found.params,
    );

    const plan: PrefetchPlan = {
      href: '/layout-page',
      pathname: '/layout-page',
      search: '',
      hash: '',
      leaf: routeInfo,
      chain: [routeInfo],
      enterRoutes: [routeInfo],
      lca: null,
      registryGeneration: 1,
    };

    const resources = planner.planResources(plan, {
      mode: 'tap',
      confidence: policy.confidenceFor('tap'),
    });

    expect(resources).toHaveLength(1);
    expect(resources[0]?.kind).toBe('view');
  });

  it('respects disabled content and data options', () => {
    const disabled = new DefaultPrefetchResourcePlanner({ view: false, data: false }, policy);
    const plan = createPlan({ view: 'html::x', load: 'profile' });
    const planCtx = { mode: 'tap' as const, confidence: policy.confidenceFor('tap') };

    expect(disabled.planResources(plan, planCtx)).toHaveLength(0);
    expect(disabled.explainEmptyPlan(plan, planCtx)).toBe('no-targets');
  });
});

describe('PrefetchResourceScheduler', () => {
  it('starts higher-priority resources before lower-priority ones', async () => {
    const order: string[] = [];
    const scheduler = new PrefetchResourceScheduler([
      {
        kind: 'view',
        run: async (resource) => {
          order.push(resource.priority);
        },
      },
      {
        kind: 'data',
        run: async (resource) => {
          order.push(resource.priority);
        },
      },
    ]);

    await scheduler.run(
      [
        { kind: 'data', targets: [], priority: 'low' },
        { kind: 'view', targets: [], priority: 'high' },
        { kind: 'view', targets: [], priority: 'normal' },
      ],
      { signal: new AbortController().signal, mode: 'manual', confidence: 1 },
    );

    expect(order).toEqual(['high', 'normal', 'low']);
  });
});

describe('ViewPrefetchExecutor', () => {
  it('delegates content resources to ViewGraph.prefetchBranch', async () => {
    const prefetchBranch = jest.fn().mockResolvedValue(undefined);
    const content = { prefetchBranch } as unknown as ViewGraph;
    const executor = new ViewPrefetchExecutor(content);
    const signal = new AbortController().signal;
    const targets = [{ href: '/page' }] as never;

    await executor.run({ kind: 'view', targets, priority: 'high' }, {
      signal,
      mode: 'manual',
      confidence: 1,
    });

    expect(prefetchBranch).toHaveBeenCalledWith(targets, signal);
  });

  it('ignores non-content resources', async () => {
    const prefetchBranch = jest.fn();
    const executor = new ViewPrefetchExecutor({
      prefetchBranch,
    } as unknown as ViewGraph);

    await executor.run({ kind: 'data', targets: [], priority: 'high' }, {
      signal: new AbortController().signal,
      mode: 'manual',
      confidence: 1,
    });

    expect(prefetchBranch).not.toHaveBeenCalled();
  });
});

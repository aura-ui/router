import { ViewGraph, LoaderRegistry } from '../../core/view-graph';
import { HandoffCache } from '../../core/resource-graph';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import { withResolvedView } from '../helpers/with-resolved-view';
import { createTestRoute } from '../helpers/create-test-route';
import type { RouteInstance } from '../../core';

function matched(
  pattern: string,
  overrides: Partial<MatchedRouteInfo> = {},
): MatchedRouteInfo {
  const { route: routeOverride, ...rest } = overrides;
  const resolved = rest.resolvedView;
  const viewFromResolved =
    resolved && typeof resolved === 'object' && 'loader' in resolved
      ? { loader: resolved.loader, content: resolved.content }
      : null;

  return withResolvedView({
    href: pattern,
    pathname: pattern,
    search: '',
    hash: '',
    pattern,
    route: createTestRoute(pattern, {
      layout: '',
      view: viewFromResolved,
      cache: NO_CACHE,
      ...(routeOverride as Partial<RouteInstance> | undefined),
    }),
    ...rest,
  });
}

describe('ViewGraph', () => {
  let registry: LoaderRegistry;
  let handoff: HandoffCache;
  let viewGraph: ViewGraph;

  beforeEach(() => {
    registry = new LoaderRegistry(undefined, []);
    handoff = new HandoffCache();
    viewGraph = new ViewGraph(handoff, { registry });
  });

  afterEach(() => {
    viewGraph.destroy();
    handoff.destroy();
  });

  it('returns null when route has no layout or view', async () => {
    const route = matched('/empty');
    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({});
  });

  it('loads layout via template loader', async () => {
    registry.register('template', async (ctx) => `<layout>${ctx.content}</layout>`);
    const route = matched('/users', {
      route: { layout: 'users-layout', view: null, cache: NO_CACHE },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      data: '<layout>users-layout</layout>',
    });
  });

  it('loads view via resolvedView loader', async () => {
    registry.register('html', async (ctx) => ctx.content);
    const route = matched('/about', {
      route: { layout: '', view: { loader: 'html', content: '<p>about</p>' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: '<p>about</p>' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({ data: '<p>about</p>' });
  });

  it('returns null immediately when signal is already aborted', async () => {
    registry.register('html', async () => {
      throw new Error('should not run');
    });
    const controller = new AbortController();
    controller.abort();
    const route = matched('/x', {
      resolvedView: { loader: 'html', content: '<p/>' },
    });

    await expect(viewGraph.loadView(route, controller.signal)).resolves.toEqual({ error: { status: 'cancelled' } });
  });

  it('caches string payloads when cache.view is enabled', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return `<p>${loads}</p>`;
    });

    const route = matched('/cached', {
      route: { layout: '', view: { loader: 'html', content: '<p/>' }, cache: { dom: false, view: true, data: false } },
      resolvedView: { loader: 'html', content: '<p/>' },
    });
    const signal = new AbortController().signal;

    await viewGraph.loadView(route, signal);
    await viewGraph.loadView(route, signal);

    expect(loads).toBe(1);
  });

  it('joins prepare handoff when cache.view is off', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return 'x';
    });

    const route = matched('/fresh', {
      route: { layout: '', view: { loader: 'html', content: 'x' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: 'x' },
    });
    const signal = new AbortController().signal;

    await viewGraph.loadView(route, signal);
    await viewGraph.loadView(route, signal);

    expect(loads).toBe(1);
  });

  it('does not persist in long cache.view when cache.view is off', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return 'x';
    });

    const route = matched('/fresh-long', {
      route: { layout: '', view: { loader: 'html', content: 'x' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: 'x' },
    });
    const signal = new AbortController().signal;

    await viewGraph.loadView(route, signal);
    expect(loads).toBe(1);

    handoff.destroy();
    handoff = new HandoffCache();
    const next = new ViewGraph(handoff, { registry });
    await next.loadView(route, signal);
    expect(loads).toBe(2);
    next.destroy();
  });

  it('passes load-hook data to custom loaders', async () => {
    let captured: unknown;
    registry.register('html', async (ctx) => {
      captured = ctx.data;
      return 'ok';
    });

    const route = matched('/users/1', {
      resolvedView: { loader: 'html', content: 'x' },
    });

    await viewGraph.loadView(route, new AbortController().signal, { data: { id: 1 } });
    expect(captured).toEqual({ id: 1 });
  });

  it('wraps loader failures in NavigationError', async () => {
    registry.register('url', async () => {
      throw new Error('network');
    });

    const route = matched('/fail', {
      resolvedView: { loader: 'url', content: 'missing.html' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).rejects.toMatchObject({
      code: 'CONTENT_LOAD_FAILED',
      phase: 'render',
      routePattern: '/fail',
    });
  });

  it('does not poison handoff when shared workSignal aborts', async () => {
    let loads = 0;
    let workSignal!: AbortSignal;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    registry.register('html', async (ctx) => {
      loads++;
      workSignal = ctx.signal;
      await Promise.race([
        gate,
        new Promise<never>((_, reject) => {
          const onAbort = () => {
            reject(ctx.signal.reason ?? new DOMException('Aborted', 'AbortError'));
          };
          if (ctx.signal.aborted) onAbort();
          else ctx.signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
      return `<p>${loads}</p>`;
    });

    const route = matched('/poison', {
      route: { layout: '', view: { loader: 'html', content: 'x' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: 'x' },
    });

    const interest = new AbortController();
    const first = viewGraph.loadView(route, interest.signal, { mode: 'navigation' });

    await Promise.resolve();
    expect(loads).toBe(1);
    expect(workSignal.aborted).toBe(false);

    interest.abort();
    await expect(first).resolves.toEqual({ error: { status: 'cancelled' } });
    expect(workSignal.aborted).toBe(true);
    // Rejected generation must leave singleflight before the next resolve can start cleanly.
    await new Promise((r) => setTimeout(r, 0));
    expect(loads).toBe(1);

    const second = viewGraph.loadView(route, new AbortController().signal, { mode: 'navigation' });
    releaseGate();
    await expect(second).resolves.toEqual({ data: '<p>2</p>' });
    expect(loads).toBe(2);
  });

  it('does not persist DocumentFragment in long cache.view', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      const fragment = document.createDocumentFragment();
      fragment.appendChild(document.createElement('section'));
      return fragment;
    });

    const route = matched('/frag', {
      route: { layout: '', view: { loader: 'html', content: 'x' }, cache: { dom: false, view: true, data: false } },
      resolvedView: { loader: 'html', content: 'x' },
    });
    const signal = new AbortController().signal;

    const first = await viewGraph.loadView(route, signal);
    expect(first.data).toBeInstanceOf(DocumentFragment);
    expect(loads).toBe(1);

    // Fresh handoff window: long cache.view must not have kept the fragment.
    handoff.destroy();
    handoff = new HandoffCache();
    const next = new ViewGraph(handoff, { registry });
    const second = await next.loadView(route, signal);

    expect(second.data).toBeInstanceOf(DocumentFragment);
    expect(second.data).not.toBe(first.data);
    expect(loads).toBe(2);
    next.destroy();
  });

  it('prefetchNode swallows loader errors', async () => {
    registry.register('html', async () => {
      throw new Error('prefetch fail');
    });

    const route = matched('/prefetch', {
      resolvedView: { loader: 'html', content: 'x' },
    });

    await expect(viewGraph.prefetchNode(route, new AbortController().signal)).resolves.toBeUndefined();
  });

  it('loadViews runs loadView in parallel for each route', async () => {
    registry.register('html', async (ctx) => ctx.content);
    const parent = matched('/users', {
      resolvedView: { loader: 'html', content: 'parent' },
    });
    const child = matched('/users/1', {
      pattern: '/users/:id',
      resolvedView: { loader: 'html', content: 'child' },
    });

    await expect(
      viewGraph.loadViews([parent, child], new AbortController().signal),
    ).resolves.toEqual({ data: [{ data: 'parent' }, { data: 'child' }] });
  });

  it('loadViews accepts a per-route options factory', async () => {
    const seen: unknown[] = [];
    registry.register('html', async (ctx) => {
      seen.push(ctx.data);
      return ctx.content;
    });
    const a = matched('/a', { resolvedView: { loader: 'html', content: 'a' } });
    const b = matched('/b', { resolvedView: { loader: 'html', content: 'b' } });

    await viewGraph.loadViews([a, b], new AbortController().signal, (route) => ({
      data: { pattern: route.pattern },
    }));

    expect(seen).toEqual([{ pattern: '/a' }, { pattern: '/b' }]);
  });

  it('loadViews returns first error and drops sibling data', async () => {
    registry.register('html', async (ctx) => {
      if (ctx.route.pattern === '/bad') throw new Error('boom');
      return ctx.content;
    });
    const ok = matched('/ok', { resolvedView: { loader: 'html', content: 'ok' } });
    const bad = matched('/bad', { resolvedView: { loader: 'html', content: 'bad' } });
    const transaction = {
      isActive: () => true,
      fail: jest.fn(async () => ({ status: 'error' as const, error: new Error('boom') })),
    };

    await expect(
      viewGraph.loadViews([ok, bad], new AbortController().signal, {
        transaction: transaction as never,
      }),
    ).resolves.toEqual({ error: { status: 'error', error: expect.any(Error) } });
  });

  it('prefetchBranch loads enter chain with bounded concurrency', async () => {
    const order: string[] = [];
    registry.register('html', async (ctx) => {
      order.push(`start:${ctx.route.pattern}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end:${ctx.route.pattern}`);
      return ctx.content;
    });

    const parent = matched('/users', {
      resolvedView: { loader: 'html', content: 'parent' },
    });
    const child = matched('/users/1', {
      pattern: '/users/:id',
      resolvedView: { loader: 'html', content: 'child' },
    });

    await viewGraph.prefetchBranch([parent, child], new AbortController().signal, {
      concurrency: 1,
      order: 'root-first',
    });

    expect(order).toEqual([
      'start:/users',
      'end:/users',
      'start:/users/:id',
      'end:/users/:id',
    ]);
  });

  it('prefetchBranch respects leaf-first order', async () => {
    const order: string[] = [];
    registry.register('html', async (ctx) => {
      order.push(`start:${ctx.route.pattern}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end:${ctx.route.pattern}`);
      return ctx.content;
    });

    const parent = matched('/users', {
      resolvedView: { loader: 'html', content: 'parent' },
    });
    const child = matched('/users/1', {
      pattern: '/users/:id',
      resolvedView: { loader: 'html', content: 'child' },
    });

    await viewGraph.prefetchBranch([parent, child], new AbortController().signal, {
      concurrency: 1,
      order: 'leaf-first',
    });

    expect(order).toEqual([
      'start:/users/:id',
      'end:/users/:id',
      'start:/users',
      'end:/users',
    ]);
  });

  it('returns null when loader throws after signal abort', async () => {
    const controller = new AbortController();
    registry.register('html', async () => {
      controller.abort();
      throw new Error('late fail');
    });

    const route = matched('/abort-on-error', {
      resolvedView: { loader: 'html', content: 'x' },
    });

    await expect(viewGraph.loadView(route, controller.signal)).resolves.toEqual({ error: { status: 'cancelled' } });
  });

  it('prefetchLeaf prefetches the active chain', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return 'x';
    });

    const parent = matched('/app', {
      resolvedView: { loader: 'html', content: 'layout' },
    });
    const leaf = matched('/app/home', {
      resolvedView: { loader: 'html', content: 'home' },
      chain: undefined,
    });
    leaf.chain = [parent, leaf];
    parent.chain = leaf.chain;

    await viewGraph.prefetchLeaf(leaf, new AbortController().signal);

    expect(loads).toBe(2);
  });

  it('invalidate clears long cache.view payloads', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return `v${loads}`;
    });

    const route = matched('/items', {
      route: { layout: '', view: { loader: 'html', content: 'x' }, cache: { dom: false, view: true, data: false } },
      resolvedView: { loader: 'html', content: 'x' },
    });
    const signal = new AbortController().signal;

    await viewGraph.loadView(route, signal);
    viewGraph.invalidate({ policy: 'remove' });

    // Fresh handoff window — long cache must miss after invalidate.
    handoff.destroy();
    handoff = new HandoffCache();
    const next = new ViewGraph(handoff, { registry });
    await next.loadView(route, signal);

    expect(loads).toBe(2);
    next.destroy();
  });

  it('loadViewDescriptor includes url extract in loader context', async () => {
    let extract: string | undefined;
    registry.register('url', async (ctx) => {
      extract = ctx.extract;
      return 'html';
    });

    await viewGraph.loadViewDescriptor(
      { kind: 'view', loader: 'url', content: 'page.html', cache: false, extract: '#main' },
      matched('/page', {
        route: { layout: '', view: { loader: 'url', content: 'page.html' }, cache: NO_CACHE },
      }),
      new AbortController().signal,
    );

    expect(extract).toBe('#main');
  });

  it('buildViewDescriptor adds route extract for url views', async () => {
    let extract: string | undefined;
    registry.register('url', async (ctx) => {
      extract = ctx.extract;
      return 'html';
    });

    const route = matched('/page', {
      route: {
        layout: '',
        view: { loader: 'url', content: 'page.html' },
        extract: '#main',
        cache: NO_CACHE,
      },
      resolvedView: { loader: 'url', content: 'page.html' },
    });

    await viewGraph.loadView(route, new AbortController().signal);
    expect(extract).toBe('#main');
  });

  it('prefers layout over view when both are present', async () => {
    registry.register('template', async (ctx) => `layout:${ctx.content}`);
    registry.register('html', async () => 'view-should-not-load');

    const route = matched('/both', {
      route: {
        layout: 'shell',
        view: { loader: 'html', content: '<p/>' },
        cache: NO_CACHE,
      },
      resolvedView: null,
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      data: 'layout:shell',
    });
  });

  it('returns data null when loader yields null', async () => {
    registry.register('html', async () => null);
    const route = matched('/empty-view', {
      resolvedView: { loader: 'html', content: 'x' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({ data: null });
  });

  it('collapses markup loader results to string payload', async () => {
    registry.register('iframe', async () => '<iframe src="/x"></iframe>');
    const route = matched('/embed', {
      resolvedView: { loader: 'iframe', content: 'https://example.com' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      data: '<iframe src="/x"></iframe>',
    });
  });

  it('loadViewDescriptor returns null when signal is already aborted', async () => {
    registry.register('html', async () => {
      throw new Error('should not run');
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      viewGraph.loadViewDescriptor(
        { kind: 'view', loader: 'html', content: 'x', cache: false },
        matched('/x', {
          route: { layout: '', view: { loader: 'html', content: 'x' }, cache: NO_CACHE },
        }),
        controller.signal,
      ),
    ).resolves.toEqual({ error: { status: 'cancelled' } });
  });

  it('omits params and query from loader context when route has none', async () => {
    let routeCtx: { href?: string; pattern?: string; params?: Record<string, string>; query?: Record<string, string> } = {};
    registry.register('html', async (ctx) => {
      routeCtx = ctx.route;
      return 'ok';
    });

    await viewGraph.loadView(
      matched('/plain', { resolvedView: { loader: 'html', content: 'x' } }),
      new AbortController().signal,
    );
    expect(routeCtx).toEqual({ href: '/plain', pattern: '/plain' });
  });

  it('destroy clears the payload cache', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return 'cached';
    });

    const route = matched('/items', {
      route: { layout: '', view: { loader: 'html', content: 'x' }, cache: { dom: false, view: true, data: false } },
      resolvedView: { loader: 'html', content: 'x' },
    });

    const graphHandoff = new HandoffCache();
    const graph = new ViewGraph(graphHandoff, { registry });
    const signal = new AbortController().signal;
    await graph.loadView(route, signal);
    await graph.loadView(route, signal);
    expect(loads).toBe(1);

    graph.destroy();
    graphHandoff.destroy();

    const nextHandoff = new HandoffCache();
    const next = new ViewGraph(nextHandoff, { registry });
    await next.loadView(route, signal);
    expect(loads).toBe(2);
    next.destroy();
    nextHandoff.destroy();
  });
});

import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { HandoffCache } from '../../core/resource-graph';
import { ViewGraph, LoaderRegistry } from '../../core/view-graph';
import { createViewGraphRoute as matched } from '../_helpers/create-mock-transaction';
import { asHtmlLoader } from '../_helpers/resource-graph-fixtures';

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
    registry.register('template', asHtmlLoader(async (ctx) => `<layout>${ctx.content}</layout>`));
    const route = matched('/users', {
      route: { layout: 'users-layout', view: null, cache: NO_CACHE },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: '<layout>users-layout</layout>',
      head: undefined,
    });
  });

  it('loads view via resolvedView loader', async () => {
    registry.register('html', asHtmlLoader(async (ctx) => ctx.content));
    const route = matched('/about', {
      route: { layout: '', view: { loader: 'html', content: '<p>about</p>' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: '<p>about</p>' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: '<p>about</p>',
      head: undefined,
    });
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

  it('hasCachedView is true after a warm cache.view load', async () => {
    registry.register('html', asHtmlLoader(async (ctx) => ctx.content));
    const route = matched('/about', {
      route: {
        layout: '',
        view: { loader: 'html', content: '<p>about</p>' },
        cache: { dom: false, view: true, data: false },
      },
      resolvedView: { loader: 'html', content: '<p>about</p>' },
    });

    expect(viewGraph.hasCachedView(route)).toBe(false);
    await viewGraph.loadView(route, new AbortController().signal);
    expect(viewGraph.hasCachedView(route)).toBe(true);
  });

  it('hasCachedView is false when cache.view is disabled', async () => {
    registry.register('html', asHtmlLoader(async (ctx) => ctx.content));
    const route = matched('/about', {
      route: {
        layout: '',
        view: { loader: 'html', content: '<p>about</p>' },
        cache: { dom: false, view: false, data: false },
      },
      resolvedView: { loader: 'html', content: '<p>about</p>' },
    });

    await viewGraph.loadView(route, new AbortController().signal);
    expect(viewGraph.hasCachedView(route)).toBe(false);
  });

  it('colocates document head on load results and restores it from cache.view hits', async () => {
    registry.register('html', async () => ({
      kind: 'html' as const,
      value: '<p>about</p>',
      head: { title: 'About', description: 'Desc' },
    }));
    const route = matched('/about', {
      route: {
        layout: '',
        view: { loader: 'html', content: 'x' },
        cache: { dom: false, view: true, data: false },
      },
      resolvedView: { loader: 'html', content: 'x' },
      viewKey: 'view:/about',
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: '<p>about</p>',
      head: { title: 'About', description: 'Desc' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: '<p>about</p>',
      head: { title: 'About', description: 'Desc' },
    });
    expect(viewGraph.getCachedHtmlHead(route)).toEqual({
      title: 'About',
      description: 'Desc',
    });
  });

  it('keeps document head on handoff settle when cache.view is off', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return {
        kind: 'html' as const,
        value: '<p>about</p>',
        head: { title: 'About', description: 'Desc' },
      };
    });
    const route = matched('/about', {
      route: {
        layout: '',
        view: { loader: 'html', content: 'x' },
        cache: { dom: false, view: false, data: false },
      },
      resolvedView: { loader: 'html', content: 'x' },
      viewKey: 'view:/about-head-handoff',
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: '<p>about</p>',
      head: { title: 'About', description: 'Desc' },
    });
    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: '<p>about</p>',
      head: { title: 'About', description: 'Desc' },
    });
    expect(loads).toBe(1);
    expect(viewGraph.getCachedHtmlHead(route)).toBeUndefined();
  });

  it('caches string payloads when cache.view is enabled', async () => {
    let loads = 0;
    registry.register(
      'html',
      asHtmlLoader(async () => {
        loads++;
        return `<p>${loads}</p>`;
      }),
    );

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
    registry.register(
      'html',
      asHtmlLoader(async () => {
        loads++;
        return 'x';
      }),
    );

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
    registry.register(
      'html',
      asHtmlLoader(async () => {
        loads++;
        return 'x';
      }),
    );

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
    registry.register(
      'html',
      asHtmlLoader(async (ctx) => {
        captured = ctx.data;
        return 'ok';
      }),
    );

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

    registry.register(
      'html',
      asHtmlLoader(async (ctx) => {
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
      }),
    );

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
    await expect(second).resolves.toEqual({ payload: '<p>2</p>', head: undefined });
    expect(loads).toBe(2);
  });

  it('does not persist DocumentFragment in handoff or long cache.view', async () => {
    let loads = 0;
    registry.register(
      'html',
      asHtmlLoader(async () => {
        loads++;
        const fragment = document.createDocumentFragment();
        fragment.appendChild(document.createElement('section'));
        return fragment;
      }),
    );

    const route = matched('/frag', {
      route: { layout: '', view: { loader: 'html', content: 'x' }, cache: { dom: false, view: true, data: false } },
      resolvedView: { loader: 'html', content: 'x' },
    });
    const signal = new AbortController().signal;

    const first = await viewGraph.loadView(route, signal);
    expect(first.payload).toBeInstanceOf(DocumentFragment);
    expect(loads).toBe(1);

    // Same handoff + cache.view: fragment must not settle (mount would empty a reused node).
    const second = await viewGraph.loadView(route, signal);
    expect(second.payload).toBeInstanceOf(DocumentFragment);
    expect(second.payload).not.toBe(first.payload);
    expect(loads).toBe(2);
  });

  it('load(mode: prefetch) swallows loader errors', async () => {
    registry.register('html', async () => {
      throw new Error('prefetch fail');
    });

    const route = matched('/prefetch', {
      resolvedView: { loader: 'html', content: 'x' },
    });

    await expect(
      viewGraph.load([route], new AbortController().signal, { mode: 'prefetch' }),
    ).resolves.toEqual({});
  });

  it('load runs loadView in parallel for each route', async () => {
    registry.register('html', asHtmlLoader(async (ctx) => ctx.content));
    const parent = matched('/users', {
      resolvedView: { loader: 'html', content: 'parent' },
    });
    const child = matched('/users/1', {
      pattern: '/users/:id',
      resolvedView: { loader: 'html', content: 'child' },
    });

    await expect(
      viewGraph.load([parent, child], new AbortController().signal),
    ).resolves.toEqual({
      data: [
        { payload: 'parent', head: undefined },
        { payload: 'child', head: undefined },
      ],
    });
  });

  it('load accepts a per-route data resolver', async () => {
    const seen: unknown[] = [];
    registry.register(
      'html',
      asHtmlLoader(async (ctx) => {
        seen.push(ctx.data);
        return ctx.content;
      }),
    );
    const a = matched('/a', { resolvedView: { loader: 'html', content: 'a' } });
    const b = matched('/b', { resolvedView: { loader: 'html', content: 'b' } });

    await viewGraph.load([a, b], new AbortController().signal, {
      data: (route: MatchedRouteInfo) => ({ pattern: route.pattern }),
    });

    expect(seen).toEqual([{ pattern: '/a' }, { pattern: '/b' }]);
  });

  it('load returns first error and drops sibling data', async () => {
    registry.register(
      'html',
      asHtmlLoader(async (ctx) => {
        if (ctx.route.pattern === '/bad') throw new Error('boom');
        return ctx.content;
      }),
    );
    const ok = matched('/ok', { resolvedView: { loader: 'html', content: 'ok' } });
    const bad = matched('/bad', { resolvedView: { loader: 'html', content: 'bad' } });
    const transaction = {
      isActive: () => true,
      fail: jest.fn(async () => ({ status: 'error' as const, error: new Error('boom') })),
    };

    await expect(
      viewGraph.load([ok, bad], new AbortController().signal, {
        transaction: transaction as never,
      }),
    ).resolves.toEqual({ error: { status: 'error', error: expect.any(Error) } });
  });

  it('load(mode: prefetch) loads enter routes with bounded concurrency', async () => {
    const order: string[] = [];
    registry.register(
      'html',
      asHtmlLoader(async (ctx) => {
        order.push(`start:${ctx.route.pattern}`);
        await new Promise((r) => setTimeout(r, 10));
        order.push(`end:${ctx.route.pattern}`);
        return ctx.content;
      }),
    );

    const parent = matched('/users', {
      resolvedView: { loader: 'html', content: 'parent' },
    });
    const child = matched('/users/1', {
      pattern: '/users/:id',
      resolvedView: { loader: 'html', content: 'child' },
    });

    await viewGraph.load([parent, child], new AbortController().signal, {
      mode: 'prefetch',
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

  it('load(mode: prefetch) respects leaf-first order', async () => {
    const order: string[] = [];
    registry.register(
      'html',
      asHtmlLoader(async (ctx) => {
        order.push(`start:${ctx.route.pattern}`);
        await new Promise((r) => setTimeout(r, 10));
        order.push(`end:${ctx.route.pattern}`);
        return ctx.content;
      }),
    );

    const parent = matched('/users', {
      resolvedView: { loader: 'html', content: 'parent' },
    });
    const child = matched('/users/1', {
      pattern: '/users/:id',
      resolvedView: { loader: 'html', content: 'child' },
    });

    await viewGraph.load([parent, child], new AbortController().signal, {
      mode: 'prefetch',
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

  it('invalidate clears long cache.view payloads', async () => {
    let loads = 0;
    registry.register(
      'html',
      asHtmlLoader(async () => {
        loads++;
        return `v${loads}`;
      }),
    );

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

  it('loadPayload includes url extract in loader context', async () => {
    let extract: string | undefined;
    registry.register(
      'url',
      asHtmlLoader(async (ctx) => {
        extract = ctx.extract;
        return 'html';
      }),
    );

    await viewGraph.loadPayload(
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
    registry.register(
      'url',
      asHtmlLoader(async (ctx) => {
        extract = ctx.extract;
        return 'html';
      }),
    );

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

  it('buildViewDescriptor omits extract for non-url loaders', async () => {
    let htmlExtract: string | undefined;
    let componentExtract: string | undefined;
    registry.register(
      'html',
      asHtmlLoader(async (ctx) => {
        htmlExtract = ctx.extract;
        return ctx.content;
      }),
    );
    registry.register(
      'component',
      asHtmlLoader(async (ctx) => {
        componentExtract = ctx.extract;
        return '<x-card></x-card>';
      }),
    );

    await viewGraph.loadView(
      matched('/html', {
        route: {
          layout: '',
          view: { loader: 'html', content: '<main id="main">x</main>' },
          extract: '#main',
          cache: NO_CACHE,
        },
        resolvedView: { loader: 'html', content: '<main id="main">x</main>' },
      }),
      new AbortController().signal,
    );
    await viewGraph.loadView(
      matched('/component', {
        route: {
          layout: '',
          view: { loader: 'component', content: 'x-card' },
          extract: '#main',
          cache: NO_CACHE,
        },
        resolvedView: { loader: 'component', content: 'x-card' },
      }),
      new AbortController().signal,
    );

    expect(htmlExtract).toBeUndefined();
    expect(componentExtract).toBeUndefined();
  });

  it('prefers layout over view when both are present', async () => {
    registry.register('template', asHtmlLoader(async (ctx) => `layout:${ctx.content}`));
    registry.register('html', asHtmlLoader(async () => 'view-should-not-load'));

    const route = matched('/both', {
      route: {
        layout: 'shell',
        view: { loader: 'html', content: '<p/>' },
        cache: NO_CACHE,
      },
      resolvedView: null,
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: 'layout:shell',
      head: undefined,
    });
  });

  it('returns payload null when loader yields null', async () => {
    registry.register('html', async () => null);
    const route = matched('/empty-view', {
      resolvedView: { loader: 'html', content: 'x' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: null,
      head: undefined,
    });
  });

  it('collapses markup loader results to string payload', async () => {
    registry.register('iframe', asHtmlLoader(async () => '<iframe src="/x"></iframe>'));
    const route = matched('/embed', {
      resolvedView: { loader: 'iframe', content: 'https://example.com' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toEqual({
      payload: '<iframe src="/x"></iframe>',
      head: undefined,
    });
  });

  it('loadPayload returns null when signal is already aborted', async () => {
    registry.register('html', async () => {
      throw new Error('should not run');
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      viewGraph.loadPayload(
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
    registry.register(
      'html',
      asHtmlLoader(async (ctx) => {
        routeCtx = ctx.route;
        return 'ok';
      }),
    );

    await viewGraph.loadView(
      matched('/plain', { resolvedView: { loader: 'html', content: 'x' } }),
      new AbortController().signal,
    );
    expect(routeCtx).toEqual({ href: '/plain', pattern: '/plain' });
  });

  it('destroy clears the payload cache', async () => {
    let loads = 0;
    registry.register(
      'html',
      asHtmlLoader(async () => {
        loads++;
        return 'cached';
      }),
    );

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

  it('configure merges default cache options for new graphs', () => {
    const graphProto = ViewGraph as unknown as { defaultCacheOptions: Record<string, unknown> };
    const prev = { ...graphProto.defaultCacheOptions };
    try {
      ViewGraph.configure({ max: 11, staleTime: 5_000 });
      const graph = new ViewGraph(new HandoffCache(), { registry });
      expect(graph).toBeInstanceOf(ViewGraph);
      graph.destroy();
    } finally {
      graphProto.defaultCacheOptions = prev;
    }
  });
});

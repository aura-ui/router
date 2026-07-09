import { ViewGraph, ViewPayloadCache, LoaderRegistry, viewCacheKey } from '../../core/view-graph';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NO_CACHE } from '../../../aura-route/core/attr/cache-attr-parser';
import { withResolvedView } from '../helpers/with-resolved-view';

function matched(
  pattern: string,
  overrides: Partial<MatchedRouteInfo> = {},
): MatchedRouteInfo {
  return withResolvedView({
    href: pattern,
    pathname: pattern,
    search: '',
    hash: '',
    pattern,
    route: {
      layout: '',
      view: null,
      cache: NO_CACHE,
    },
    ...overrides,
  } as MatchedRouteInfo);
}

describe('ViewGraph', () => {
  let registry: LoaderRegistry;
  let viewGraph: ViewGraph;

  beforeEach(() => {
    registry = new LoaderRegistry(undefined, []);
    viewGraph = new ViewGraph({ registry, cache: new ViewPayloadCache() });
  });

  afterEach(() => {
    viewGraph.destroy();
  });

  it('returns null when route has no layout or view', async () => {
    const route = matched('/empty');
    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBeNull();
  });

  it('loads layout via template loader', async () => {
    registry.register('template', async (ctx) => `<layout>${ctx.content}</layout>`);
    const route = matched('/users', {
      route: { layout: 'users-layout', view: null, cache: NO_CACHE },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBe(
      '<layout>users-layout</layout>',
    );
  });

  it('loads view via resolvedView loader', async () => {
    registry.register('html', async (ctx) => ctx.content);
    const route = matched('/about', {
      route: { layout: '', view: { loader: 'html', content: '<p>about</p>' }, cache: NO_CACHE },
      resolvedView: { loader: 'html', content: '<p>about</p>' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBe('<p>about</p>');
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

    await expect(viewGraph.loadView(route, controller.signal)).resolves.toBeNull();
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

  it('does not cache when cache.view is off', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return 'x';
    });

    const route = matched('/fresh', {
      resolvedView: { loader: 'html', content: 'x' },
    });
    const signal = new AbortController().signal;

    await viewGraph.loadView(route, signal);
    await viewGraph.loadView(route, signal);

    expect(loads).toBe(2);
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

  it('does not cache DocumentFragment payloads when cache.view is enabled', async () => {
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
    const second = await viewGraph.loadView(route, signal);

    expect(first).toBeInstanceOf(DocumentFragment);
    expect(second).toBeInstanceOf(DocumentFragment);
    expect(first).not.toBe(second);
    expect(loads).toBe(2);
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

    await expect(viewGraph.loadView(route, controller.signal)).resolves.toBeNull();
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

  it('invalidate clears cached payloads', async () => {
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
    await viewGraph.loadView(route, signal);

    expect(loads).toBe(2);
  });

  it('loadViewDescriptor includes url extract in loader context', async () => {
    let extract: string | undefined;
    registry.register('url', async (ctx) => {
      extract = ctx.extract;
      return 'html';
    });

    await viewGraph.loadViewDescriptor(
      { kind: 'view', loader: 'url', content: 'page.html', cache: false, extract: '#main' },
      matched('/page'),
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

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBe(
      'layout:shell',
    );
  });

  it('returns null when loader yields null', async () => {
    registry.register('html', async () => null);
    const route = matched('/empty-view', {
      resolvedView: { loader: 'html', content: 'x' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBeNull();
  });

  it('collapses markup loader results to string payload', async () => {
    registry.register('iframe', async () => '<iframe src="/x"></iframe>');
    const route = matched('/embed', {
      resolvedView: { loader: 'iframe', content: 'https://example.com' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBe(
      '<iframe src="/x"></iframe>',
    );
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
        matched('/x'),
        controller.signal,
      ),
    ).resolves.toBeNull();
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
    const cache = new ViewPayloadCache();
    const graph = new ViewGraph({ registry, cache });
    registry.register('html', async () => 'cached');

    const route = matched('/items', {
      route: { layout: '', view: { loader: 'html', content: 'x' }, cache: { dom: false, view: true, data: false } },
      resolvedView: { loader: 'html', content: 'x' },
    });
    const key = viewCacheKey(
      { kind: 'view', loader: 'html', content: 'x', cache: true },
      route,
    );

    await graph.loadView(route, new AbortController().signal);
    expect(cache.get(key)).toBe('cached');

    graph.destroy();
    expect(cache.get(key)).toBeUndefined();
  });
});

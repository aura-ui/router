import { ViewGraph, PayloadCache, LoaderRegistry } from '../../core/view-graph';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
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
      preserve: { view: false },
    },
    ...overrides,
  } as MatchedRouteInfo);
}

describe('ViewGraph', () => {
  let registry: LoaderRegistry;
  let viewGraph: ViewGraph;

  beforeEach(() => {
    registry = new LoaderRegistry(undefined, []);
    viewGraph = new ViewGraph({ registry, cache: new PayloadCache() });
  });

  afterEach(() => {
    viewGraph.destroy();
  });

  it('returns null when route has no layout or view', async () => {
    const route = matched('/empty');
    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBeNull();
  });

  it('loads layout via template loader', async () => {
    registry.register('template', async (ctx) => `<layout>${ctx.ref}</layout>`);
    const route = matched('/users', {
      route: { layout: 'users-layout', view: null, preserve: { view: false } },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBe(
      '<layout>users-layout</layout>',
    );
  });

  it('loads view via resolvedView type', async () => {
    registry.register('html', async (ctx) => ctx.ref);
    const route = matched('/about', {
      route: { layout: '', view: { type: 'html', content: '<p>about</p>' }, preserve: { view: false } },
      resolvedView: { type: 'html', ref: '<p>about</p>' },
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
      resolvedView: { type: 'html', ref: '<p/>' },
    });

    await expect(viewGraph.loadView(route, controller.signal)).resolves.toBeNull();
  });

  it('caches string payloads when preserve.view is enabled', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return `<p>${loads}</p>`;
    });

    const route = matched('/cached', {
      route: { layout: '', view: { type: 'html', content: '<p/>' }, preserve: { view: true } },
      resolvedView: { type: 'html', ref: '<p/>' },
    });
    const signal = new AbortController().signal;

    await viewGraph.loadView(route, signal);
    await viewGraph.loadView(route, signal);

    expect(loads).toBe(1);
  });

  it('does not cache when preserve.view is off', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return 'x';
    });

    const route = matched('/fresh', {
      resolvedView: { type: 'html', ref: 'x' },
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
      resolvedView: { type: 'html', ref: 'x' },
    });

    await viewGraph.loadView(route, new AbortController().signal, { data: { id: 1 } });
    expect(captured).toEqual({ id: 1 });
  });

  it('wraps loader failures in NavigationError', async () => {
    registry.register('url', async () => {
      throw new Error('network');
    });

    const route = matched('/fail', {
      resolvedView: { type: 'url', ref: 'missing.html' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).rejects.toMatchObject({
      code: 'CONTENT_LOAD_FAILED',
      phase: 'render',
      routePattern: '/fail',
    });
  });

  it('does not cache DocumentFragment payloads when preserve.view is enabled', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      const fragment = document.createDocumentFragment();
      fragment.appendChild(document.createElement('section'));
      return fragment;
    });

    const route = matched('/frag', {
      route: { layout: '', view: { type: 'html', content: 'x' }, preserve: { view: true } },
      resolvedView: { type: 'html', ref: 'x' },
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
      resolvedView: { type: 'html', ref: 'x' },
    });

    await expect(viewGraph.prefetchNode(route, new AbortController().signal)).resolves.toBeUndefined();
  });

  it('prefetchBranch loads enter chain with bounded concurrency', async () => {
    const order: string[] = [];
    registry.register('html', async (ctx) => {
      order.push(`start:${ctx.route.pattern}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end:${ctx.route.pattern}`);
      return ctx.ref;
    });

    const parent = matched('/users', {
      resolvedView: { type: 'html', ref: 'parent' },
    });
    const child = matched('/users/1', {
      pattern: '/users/:id',
      resolvedView: { type: 'html', ref: 'child' },
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

  it('prefetchLeaf prefetches the active chain', async () => {
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return 'x';
    });

    const parent = matched('/app', {
      resolvedView: { type: 'html', ref: 'layout' },
    });
    const leaf = matched('/app/home', {
      resolvedView: { type: 'html', ref: 'home' },
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
      route: { layout: '', view: { type: 'html', content: 'x' }, preserve: { view: true } },
      resolvedView: { type: 'html', ref: 'x' },
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
      { kind: 'view', loader: 'url', ref: 'page.html', cache: false, extract: '#main' },
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
        view: { type: 'url', content: 'page.html' },
        extract: '#main',
        preserve: { view: false },
      },
      resolvedView: { type: 'url', ref: 'page.html' },
    });

    await viewGraph.loadView(route, new AbortController().signal);
    expect(extract).toBe('#main');
  });

  it('prefers layout over view when both are present', async () => {
    registry.register('template', async (ctx) => `layout:${ctx.ref}`);
    registry.register('html', async () => 'view-should-not-load');

    const route = matched('/both', {
      route: {
        layout: 'shell',
        view: { type: 'html', content: '<p/>' },
        preserve: { view: false },
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
      resolvedView: { type: 'html', ref: 'x' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBeNull();
  });

  it('collapses markup loader results to string payload', async () => {
    registry.register('iframe', async () => '<iframe src="/x"></iframe>');
    const route = matched('/embed', {
      resolvedView: { type: 'iframe', ref: 'https://example.com' },
    });

    await expect(viewGraph.loadView(route, new AbortController().signal)).resolves.toBe(
      '<iframe src="/x"></iframe>',
    );
  });
});

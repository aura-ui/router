import {
  PayloadCache,
  ContentGraph,
  LoaderRegistry,
  createLoaderRegistry,
  payloadCacheKey,
  type ContentDescriptor,
} from '../../core/content-graph';
import { parseViewAttr } from '../../../aura-route/core/attr/view-attr-parser';
import { withResolvedView } from '../helpers/with-resolved-view';
import { AuraRoute } from '../../../aura-route/core/aura-route';

const routeInfo = {
  href: '/page',
  pathname: '/page',
  search: '',
  hash: '',
  pattern: '/page',
} as const;

describe('ContentGraph (resolve)', () => {
  it('returns null when signal is aborted', async () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.registerFn('html', async () => 'never');

    const graph = new ContentGraph({
      registry,
      cache: new PayloadCache(),
    });

    const controller = new AbortController();
    controller.abort();

    const result = await graph.loadViewDescriptor(
      { kind: 'content', loader: 'html', ref: '<p>x</p>', cache: false },
      routeInfo as never,
      controller.signal,
    );

    expect(result).toBeNull();
  });

  it('uses cache when descriptor.cache is true', async () => {
    const registry = new LoaderRegistry(undefined, []);
    let loads = 0;
    registry.registerFn('html', async () => {
      loads++;
      return `<span>${loads}</span>`;
    });

    const cache = new PayloadCache();
    const graph = new ContentGraph({ registry, cache });
    const descriptor: ContentDescriptor = {
      kind: 'content',
      loader: 'html',
      ref: 'static',
      cache: true,
    };
    const signal = new AbortController().signal;

    await graph.loadViewDescriptor(descriptor, routeInfo as never, signal);
    await graph.loadViewDescriptor(descriptor, routeInfo as never, signal);

    expect(loads).toBe(1);
  });

  it('prefetch warms cache when descriptor.cache is true', async () => {
    const registry = new LoaderRegistry(undefined, []);
    let loads = 0;
    registry.registerFn('html', async () => {
      loads++;
      return '<span>warm</span>';
    });

    const cache = new PayloadCache();
    const graph = new ContentGraph({ registry, cache });
    const descriptor: ContentDescriptor = {
      kind: 'content',
      loader: 'html',
      ref: 'static',
      cache: true,
    };
    const info = withResolvedView({
      ...routeInfo,
      route: {
        layout: '',
        view: parseViewAttr('html::static'),
        preserve: { view: true, data: false },
      } as AuraRoute,
    });

    await graph.prefetchNode(info as never, new AbortController().signal);
    expect(cache.get(payloadCacheKey(descriptor, info as never))).toBeDefined();

    await graph.loadViewDescriptor(descriptor, info as never, new AbortController().signal);
    expect(loads).toBe(1);
  });

  it('passes extract to url loader from route attr', async () => {
    const registry = new LoaderRegistry(undefined, []);
    let receivedExtract: string | undefined;
    registry.registerFn('url', async (ctx) => {
      receivedExtract = ctx.extract;
      return '<span>ok</span>';
    });

    const graph = new ContentGraph({ registry, cache: new PayloadCache() });

    await graph.loadView(
      {
        ...routeInfo,
        route: {
          layout: '',
          preserve: { view: false },
          extract: '#main',
        } as never,
        resolvedView: { type: 'url', ref: 'pages/about.html' },
      } as never,
      new AbortController().signal,
    );

    expect(receivedExtract).toBe('#main');
  });

  it('does not pass extract when route opts out with extract=""', async () => {
    const registry = new LoaderRegistry(undefined, []);
    let receivedExtract: string | undefined = '#unset';
    registry.registerFn('url', async (ctx) => {
      receivedExtract = ctx.extract;
      return '<span>ok</span>';
    });

    const graph = new ContentGraph({ registry, cache: new PayloadCache() });

    await graph.loadView(
      {
        ...routeInfo,
        route: {
          layout: '',
          preserve: { view: false },
          extract: '',
        } as never,
        resolvedView: { type: 'url', ref: 'pages/about.html' },
      } as never,
      new AbortController().signal,
    );

    expect(receivedExtract).toBeUndefined();
  });

  it('does not pass extract for html loader even when route has extract', async () => {
    const registry = new LoaderRegistry(undefined, []);
    let receivedExtract: string | undefined = '#unset';
    registry.registerFn('html', async (ctx) => {
      receivedExtract = ctx.extract;
      return ctx.ref;
    });

    const graph = new ContentGraph({ registry, cache: new PayloadCache() });

    await graph.loadView(
      {
        ...routeInfo,
        route: {
          layout: '',
          preserve: { view: false },
          extract: '#main',
        } as never,
        resolvedView: { type: 'html', ref: '<b>hi</b>' },
      } as never,
      new AbortController().signal,
    );

    expect(receivedExtract).toBeUndefined();
  });

  it('wraps extract selector miss as CONTENT_LOAD_FAILED', async () => {
    const registry = createLoaderRegistry({
      fetchText: async () => '<html><body></body></html>',
      resolveUrl: (path) => path,
      isSSR: false,
    });

    const graph = new ContentGraph({ registry, cache: new PayloadCache() });

    await expect(
      graph.loadView(
        {
          ...routeInfo,
          route: {
            layout: '',
            preserve: { view: false },
            extract: '#missing',
          } as never,
          resolvedView: { type: 'url', ref: 'legacy/about.html' },
        } as never,
        new AbortController().signal,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'CONTENT_LOAD_FAILED',
        phase: 'render',
        routePattern: '/page',
        message: expect.stringContaining('No element matches selector "#missing"'),
      }),
    );
  });

  it('keeps separate cache entries for partial vs extract on the same ref', async () => {
    const registry = new LoaderRegistry(undefined, []);
    let loads = 0;
    registry.registerFn('url', async (ctx) => {
      loads++;
      return ctx.extract ? '<fragment/>' : '<full/>';
    });

    const cache = new PayloadCache();
    const graph = new ContentGraph({ registry, cache });
    const signal = new AbortController().signal;
    const baseRoute = {
      layout: '',
      preserve: { view: true },
    };

    const partial = {
      ...routeInfo,
      route: { ...baseRoute, extract: null } as never,
      resolvedView: { type: 'url', ref: 'legacy/about.html' },
    } as const;

    const extracted = {
      ...routeInfo,
      route: { ...baseRoute, extract: '#main' } as never,
      resolvedView: { type: 'url', ref: 'legacy/about.html' },
    } as const;

    const partialPayload = await graph.loadView(partial as never, signal);
    const extractPayload = await graph.loadView(extracted as never, signal);

    expect(partialPayload).toBe('<full/>');
    expect(extractPayload).toBe('<fragment/>');
    expect(loads).toBe(2);
  });

  it('throws NavigationError when loader fails', async () => {
    const registry = new LoaderRegistry(undefined, []);
    registry.registerFn('html', async () => {
      throw new Error('network');
    });

    const graph = new ContentGraph({ registry, cache: new PayloadCache() });

    await expect(
      graph.loadViewDescriptor(
        { kind: 'content', loader: 'html', ref: 'static', cache: false },
        routeInfo as never,
        new AbortController().signal,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'CONTENT_LOAD_FAILED',
        phase: 'render',
        routePattern: '/page',
      }),
    );
  });
});

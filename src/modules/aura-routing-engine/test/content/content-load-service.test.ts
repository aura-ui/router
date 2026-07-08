import {
  DataCache,
  ContentLoadService,
  LoaderRegistry,
  dataCacheKey,
  createBuiltinLoaders,
  type ContentDescriptor,
} from '../../core';
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

describe('ContentLoadService', () => {
  it('returns null when signal is aborted', async () => {
    const registry = new LoaderRegistry();
    registry.register('html', async () => 'never');

    const service = new ContentLoadService({
      registry,
      cache: new DataCache(),
    });

    const controller = new AbortController();
    controller.abort();

    const result = await service.resolveDescriptor(
      { kind: 'content', loader: 'html', ref: '<p>x</p>', cache: false },
      routeInfo as never,
      controller.signal,
    );

    expect(result).toBeNull();
  });

  it('uses cache when descriptor.cache is true', async () => {
    const registry = new LoaderRegistry();
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return `<span>${loads}</span>`;
    });

    const cache = new DataCache();
    const service = new ContentLoadService({ registry, cache });
    const descriptor: ContentDescriptor = {
      kind: 'content',
      loader: 'html',
      ref: 'static',
      cache: true,
    };
    const signal = new AbortController().signal;

    await service.resolveDescriptor(descriptor, routeInfo as never, signal);
    await service.resolveDescriptor(descriptor, routeInfo as never, signal);

    expect(loads).toBe(1);
  });

  it('prefetch warms cache when descriptor.cache is true', async () => {
    const registry = new LoaderRegistry();
    let loads = 0;
    registry.register('html', async () => {
      loads++;
      return '<span>warm</span>';
    });

    const cache = new DataCache();
    const service = new ContentLoadService({ registry, cache });
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

    await service.prefetchNode(info as never, new AbortController().signal);
    expect(cache.get(dataCacheKey(descriptor, info as never))).toBeDefined();

    await service.resolveDescriptor(descriptor, info as never, new AbortController().signal);
    expect(loads).toBe(1);
  });

  it('passes extract to url loader from route attr', async () => {
    const registry = new LoaderRegistry();
    let receivedExtract: string | undefined;
    registry.register('url', async (ctx) => {
      receivedExtract = ctx.extract;
      return '<span>ok</span>';
    });

    const service = new ContentLoadService({ registry, cache: new DataCache() });

    await service.resolve(
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
    const registry = new LoaderRegistry();
    let receivedExtract: string | undefined = '#unset';
    registry.register('url', async (ctx) => {
      receivedExtract = ctx.extract;
      return '<span>ok</span>';
    });

    const service = new ContentLoadService({ registry, cache: new DataCache() });

    await service.resolve(
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
    const registry = new LoaderRegistry();
    let receivedExtract: string | undefined = '#unset';
    registry.register('html', async (ctx) => {
      receivedExtract = ctx.extract;
      return ctx.ref;
    });

    const service = new ContentLoadService({ registry, cache: new DataCache() });

    await service.resolve(
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
    const registry = new LoaderRegistry();
    for (const { type, load } of createBuiltinLoaders({
      fetchText: async () => '<html><body></body></html>',
      resolveUrl: (path) => path,
    })) {
      registry.register(type, load);
    }

    const service = new ContentLoadService({ registry, cache: new DataCache() });

    await expect(
      service.resolve(
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
    const registry = new LoaderRegistry();
    let loads = 0;
    registry.register('url', async (ctx) => {
      loads++;
      return ctx.extract ? '<fragment/>' : '<full/>';
    });

    const cache = new DataCache();
    const service = new ContentLoadService({ registry, cache });
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

    const partialPayload = await service.resolve(partial as never, signal);
    const extractPayload = await service.resolve(extracted as never, signal);

    expect(partialPayload).toBe('<full/>');
    expect(extractPayload).toBe('<fragment/>');
    expect(loads).toBe(2);
  });

  it('throws NavigationError when loader fails', async () => {
    const registry = new LoaderRegistry();
    registry.register('html', async () => {
      throw new Error('network');
    });

    const service = new ContentLoadService({ registry, cache: new DataCache() });

    await expect(
      service.resolveDescriptor(
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

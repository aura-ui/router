import {
  DataCache,
  ContentLoadService,
  LoaderRegistry,
  dataCacheKey,
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

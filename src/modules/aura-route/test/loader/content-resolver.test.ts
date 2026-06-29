import {
  ContentCache,
  ContentLoadService,
  LoaderRegistry,
  contentCacheKey,
  type ContentDescriptor,
} from '../../../aura-routing-engine/core';
import { parseViewAttr } from '../../core/attr/view-attr-parser';

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
      cache: new ContentCache(),
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

    const cache = new ContentCache();
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

    const cache = new ContentCache();
    const service = new ContentLoadService({ registry, cache });
    const descriptor: ContentDescriptor = {
      kind: 'content',
      loader: 'html',
      ref: 'static',
      cache: true,
    };
    const info = {
      ...routeInfo,
      route: {
        layout: '',
        view: parseViewAttr('html::static'),
        preserve: { view: false, data: true },
      },
    };

    await service.prefetchNode(info as never, new AbortController().signal);
    expect(cache.get(contentCacheKey(descriptor, info as never))).toBeDefined();

    await service.resolveDescriptor(descriptor, info as never, new AbortController().signal);
    expect(loads).toBe(1);
  });

  it('throws NavigationError when loader fails', async () => {
    const registry = new LoaderRegistry();
    registry.register('html', async () => {
      throw new Error('network');
    });

    const service = new ContentLoadService({ registry, cache: new ContentCache() });

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

import { ContentResolver } from '../../../aura-routing-engine/core/content/content-resolver';
import { ContentCache } from '../../../aura-routing-engine/core/content/content-cache';
import { contentCacheKey } from '../../../aura-routing-engine/core/content/content-key';
import { LoaderRegistry } from '../../../aura-routing-engine/core/content/registry';
import type { ContentDescriptor } from '../../../aura-routing-engine/core/content/types';

const routeInfo = {
  href: '/page',
  pathname: '/page',
  search: '',
  hash: '',
  pattern: '/page',
} as const;

describe('ContentResolver', () => {
  it('returns null when signal is aborted', async () => {
    const registry = new LoaderRegistry();
    registry.register('html', async () => 'never');

    const resolver = new ContentResolver({
      registry,
      cache: new ContentCache(),
    });

    const controller = new AbortController();
    controller.abort();

    const result = await resolver.resolve(
      { kind: 'content', loader: 'html', ref: '<p>x</p>', cache: false },
      { routeInfo: routeInfo as any, signal: controller.signal },
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
    const resolver = new ContentResolver({ registry, cache });
    const descriptor: ContentDescriptor = {
      kind: 'content',
      loader: 'html',
      ref: 'static',
      cache: true,
    };
    const ctx = { routeInfo: routeInfo as any, signal: new AbortController().signal };

    await resolver.resolve(descriptor, ctx);
    await resolver.resolve(descriptor, ctx);

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
    const resolver = new ContentResolver({ registry, cache });
    const descriptor: ContentDescriptor = {
      kind: 'content',
      loader: 'html',
      ref: 'static',
      cache: true,
    };
    const ctx = { routeInfo: routeInfo as any, signal: new AbortController().signal };

    await resolver.prefetch(descriptor, ctx);
    expect(cache.get(contentCacheKey(descriptor, routeInfo as any))).toBeDefined();

    await resolver.resolve(descriptor, ctx);
    expect(loads).toBe(1);
  });
});

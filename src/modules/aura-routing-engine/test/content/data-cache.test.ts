import { DataCache } from '../../core/content/cache/data-cache';

describe('DataCache', () => {
  it('dedupes in-flight loads', async () => {
    const cache = new DataCache({ max: 50, gcTime: Infinity, gcSweepInterval: false });
    let loads = 0;

    const load = () => {
      loads++;
      return Promise.resolve(`payload-${loads}`);
    };

    const [a, b] = await Promise.all([
      cache.resolve('k', load),
      cache.resolve('k', load),
    ]);

    expect(loads).toBe(1);
    expect(a).toBe('payload-1');
    expect(b).toBe('payload-1');
  });

  it('returns cached entry without calling load', async () => {
    const cache = new DataCache();
    let loads = 0;

    await cache.resolve('k', async () => {
      loads++;
      return 'cached';
    });

    const hit = await cache.resolve('k', async () => {
      loads++;
      return 'fresh';
    });

    expect(loads).toBe(1);
    expect(hit).toBe('cached');
  });

  it('does not cache DocumentFragment payloads', async () => {
    const cache = new DataCache();
    const fragment = document.createDocumentFragment();
    fragment.append(document.createElement('span'));

    await cache.resolve('k', async () => fragment);
    expect(cache.get('k')).toBeUndefined();
  });

  it('evicts least recently used entry when max exceeded', async () => {
    const cache = new DataCache({ max: 2, gcTime: Infinity, gcSweepInterval: false });
    await cache.resolve('a', async () => 'A');
    await cache.resolve('b', async () => 'B');
    await cache.resolve('c', async () => 'C');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('B');
    expect(cache.get('c')).toBe('C');
  });
});

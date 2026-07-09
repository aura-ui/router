import { ViewPayloadCache } from '../../../core/view-graph/cache/view-payload-cache';

describe('ViewPayloadCache', () => {
  let cache: ViewPayloadCache;

  afterEach(() => {
    cache?.destroy();
  });

  it('stores and retrieves string payloads', async () => {
    cache = new ViewPayloadCache();
    expect(cache.get('/a')).toBeUndefined();

    const value = await cache.resolve('/a', async () => 'html');

    expect(value).toBe('html');
    expect(cache.get('/a')).toBe('html');
  });

  it('deduplicates concurrent resolve calls for the same key', async () => {
    cache = new ViewPayloadCache();
    let loads = 0;

    const load = async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 20));
      return `v${loads}`;
    };

    const [a, b] = await Promise.all([
      cache.resolve('/dup', load),
      cache.resolve('/dup', load),
    ]);

    expect(loads).toBe(1);
    expect(a).toBe('v1');
    expect(b).toBe('v1');
  });

  it('does not persist DocumentFragment results', async () => {
    cache = new ViewPayloadCache();
    const fragment = document.createDocumentFragment();
    fragment.appendChild(document.createElement('span'));

    const payload = await cache.resolve('/frag', async () => fragment);

    expect(payload).toBe(fragment);
    expect(cache.get('/frag')).toBeUndefined();
  });

  it('clear removes cached entries', async () => {
    cache = new ViewPayloadCache();
    await cache.resolve('/x', async () => 'cached');
    cache.clear();
    expect(cache.get('/x')).toBeUndefined();
  });

  it('invalidate removes entries by key', async () => {
    cache = new ViewPayloadCache();
    await cache.resolve('/users|view:html:a', async () => 'a');
    await cache.resolve('/profile|view:html:b', async () => 'b');

    const count = cache.invalidate({ key: '/users|view:html:a', policy: 'remove' });

    expect(count).toBe(1);
    expect(cache.get('/users|view:html:a')).toBeUndefined();
    expect(cache.get('/profile|view:html:b')).toBe('b');
  });

  it('invalidate with default policy marks entries stale but keeps values', async () => {
    cache = new ViewPayloadCache();
    await cache.resolve('/stale', async () => 'cached');

    const count = cache.invalidate();

    expect(count).toBe(1);
    expect(cache.get('/stale')).toBe('cached');
  });

  it('destroy clears cached entries', async () => {
    cache = new ViewPayloadCache();
    await cache.resolve('/x', async () => 'cached');
    cache.destroy();
    expect(cache.get('/x')).toBeUndefined();
  });
});

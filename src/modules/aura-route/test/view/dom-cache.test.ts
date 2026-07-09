import { RouteDomCache } from '../../core/view/dom-cache';

describe('RouteDomCache', () => {
  beforeEach(() => {
    RouteDomCache.configure({ max: 5, gcTime: Infinity, gcSweepInterval: false });
  });

  it('extract removes entry from store', () => {
    const cache = new RouteDomCache();
    const root = document.createElement('div');

    cache.put('a', root);
    expect(cache.extract('a')).toBe(root);
    expect(cache.extract('a')).toBeUndefined();
  });

  it('extract preserves detached subtree (not onRemove)', () => {
    const cache = new RouteDomCache();
    const root = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'cached';
    root.append(child);

    cache.put('k', root);
    const taken = cache.extract('k');

    expect(taken).toBe(root);
    expect(taken?.textContent).toBe('cached');
    expect(taken?.firstElementChild).toBe(child);
  });

  it('put replaces existing entry and destroys previous root', () => {
    RouteDomCache.configure({ max: 5, gcTime: Infinity, gcSweepInterval: false });

    const cache = new RouteDomCache();
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first);

    cache.put('k', first);
    cache.put('k', second);

    expect(first.isConnected).toBe(false);
    expect(cache.extract('k')).toBe(second);
  });

  it('removes oldest when max exceeded', () => {
    const removed: Element[] = [];
    RouteDomCache.configure({
      max: 2,
      gcTime: Infinity,
      gcSweepInterval: false,
      onRemove: (_key, root) => removed.push(root),
    });

    const cache = new RouteDomCache();
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('div');

    cache.put('a', a);
    cache.put('b', b);
    cache.put('c', c);

    expect(removed).toEqual([a]);
    expect(cache.extract('a')).toBeUndefined();
    expect(cache.extract('b')).toBe(b);
    expect(cache.extract('c')).toBe(c);
  });
});

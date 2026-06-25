import { AuraCacheStore, DEFAULT_GC_TIME } from '../core/aura-cache-store';

describe('AuraCacheStore', () => {
  let cache: AuraCacheStore<any> | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cache?.destroy();
    cache = undefined;
    jest.useRealTimers();
  });

  describe('basics', () => {
    it('returns undefined for missing keys', () => {
      cache = new AuraCacheStore<string>();
      expect(cache.get('missing')).toBeUndefined();
      expect(cache.has('missing')).toBe(false);
      expect(cache.isStale('missing')).toBe(false);
      expect(cache.lookup('missing')).toEqual({ status: 'missing' });
    });

    it('lookup returns fresh in simple mode without staleTime', () => {
      cache = new AuraCacheStore<string>({ gcSweepInterval: false });
      cache.set('a', 'one');

      expect(cache.lookup('a')).toEqual({ status: 'fresh', value: 'one' });
    });

    it('stores and reads values without gcTime', () => {
      cache = new AuraCacheStore<string>();
      cache.set('a', 'one');

      jest.advanceTimersByTime(60_000);

      expect(cache.get('a')).toBe('one');
      expect(cache.size).toBe(1);
    });

    it('set calls onRemove when overwriting with a different value', () => {
      const removed: Array<[string, string]> = [];
      cache = new AuraCacheStore<string>({
        onRemove: (key, value) => removed.push([key, value]),
      });

      cache.set('a', 'one');
      cache.set('a', 'two');

      expect(cache.get('a')).toBe('two');
      expect(cache.size).toBe(1);
      expect(removed).toEqual([['a', 'one']]);
    });

    it('set does not call onRemove when overwriting with the same reference', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<string>({
        onRemove: (key) => removed.push(key),
      });
      const value = 'one';

      cache.set('a', value);
      cache.set('a', value);

      expect(removed).toEqual([]);
      expect(cache.get('a')).toBe(value);
    });

    it('set keeps previous value when onRemove throws during overwrite', () => {
      const localCache = new AuraCacheStore<string>({
        onRemove: () => {
          throw new Error('cleanup failed');
        },
      });
      localCache.set('a', 'one');

      expect(() => localCache.set('a', 'two')).toThrow('cleanup failed');
      expect(localCache.get('a')).toBe('one');
    });

    it('keys returns a snapshot without promoting LRU when gcTime is unset', () => {
      cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');

      expect(cache.keys().sort()).toEqual(['a', 'b']);

      cache.lookup('a');
      cache.set('c', 'C');

      expect(cache.has('a')).toBe(false);
      expect(cache.keys().sort()).toEqual(['b', 'c']);
    });

    it('throws when max is less than 1', () => {
      expect(() => new AuraCacheStore<string>({ max: 0 })).toThrow('max must be >= 1');
      expect(() => new AuraCacheStore<string>({ max: -1 })).toThrow('max must be >= 1');
    });

    it('throws when timings are negative or NaN', () => {
      expect(() => new AuraCacheStore<string>({ staleTime: -1 })).toThrow('staleTime must be >= 0');
      expect(() => new AuraCacheStore<string>({ gcTime: -1 })).toThrow('gcTime must be >= 0');
      expect(() => new AuraCacheStore<string>({ gcTime: Number.NaN })).toThrow('gcTime must be >= 0');
      expect(() => new AuraCacheStore<string>({ gcSweepInterval: -1 })).toThrow(
        'gcSweepInterval must be a positive number',
      );
      expect(() => new AuraCacheStore<string>({ gcSweepInterval: 0 })).toThrow(
        'gcSweepInterval must be a positive number',
      );
    });

    it('throws when gcSweepInterval is set without finite gcTime', () => {
      expect(() => new AuraCacheStore<string>({ gcSweepInterval: 500 })).toThrow(
        'gcSweepInterval requires a finite gcTime',
      );
      expect(() =>
        new AuraCacheStore<string>({ staleTime: 1_000, gcTime: Infinity, gcSweepInterval: 500 }),
      ).toThrow('gcSweepInterval requires a finite gcTime');
    });
  });

  describe('gcTime without SWR', () => {
    it('removes expired entries on get', () => {
      cache = new AuraCacheStore<string>({ gcTime: 1_000, gcSweepInterval: false });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);

      expect(cache.get('a')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('removes expired entries on lookup without a stale phase', () => {
      cache = new AuraCacheStore<string>({ gcTime: 1_000, gcSweepInterval: false });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);

      expect(cache.lookup('a')).toEqual({ status: 'missing' });
      expect(cache.size).toBe(0);
    });

    it('removes expired entries on has and isStale', () => {
      cache = new AuraCacheStore<string>({ gcTime: 1_000, gcSweepInterval: false });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);

      expect(cache.has('a')).toBe(false);
      expect(cache.isStale('a')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('calls onRemove when GC removes on read', () => {
      const removed: Array<[string, string]> = [];
      cache = new AuraCacheStore<string>({
        gcTime: 1_000,
        gcSweepInterval: false,
        onRemove: (key, value) => removed.push([key, value]),
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);
      cache.get('a');

      expect(removed).toEqual([['a', 'one']]);
      expect(cache.size).toBe(0);
    });
  });

  describe('SWR mode', () => {
    it('returns fresh then stale without removing value', () => {
      cache = new AuraCacheStore<string>({
        staleTime: 1_000,
        gcTime: 10_000,
        gcSweepInterval: false,
      });
      cache.set('a', 'one');

      expect(cache.lookup('a')).toEqual({ status: 'fresh', value: 'one' });

      jest.advanceTimersByTime(1_001);

      expect(cache.get('a')).toBe('one');
      expect(cache.lookup('a')).toEqual({ status: 'stale', value: 'one' });
      expect(cache.isStale('a')).toBe(true);
      expect(cache.has('a')).toBe(true);
    });

    it('removes entry after gcTime', () => {
      cache = new AuraCacheStore<string>({
        staleTime: 500,
        gcTime: 2_000,
        gcSweepInterval: false,
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(2_001);

      expect(cache.lookup('a')).toEqual({ status: 'missing' });
      expect(cache.size).toBe(0);
    });

    it('set clears stale flag after manual invalidation', () => {
      cache = new AuraCacheStore<string>({ staleTime: 1_000, gcSweepInterval: false });
      cache.set('a', 'one');
      cache.invalidate('a', 'stale');

      expect(cache.lookup('a').status).toBe('stale');

      cache.set('a', 'two');

      expect(cache.lookup('a')).toEqual({ status: 'fresh', value: 'two' });
    });

    it('applies default gcTime when staleTime is set without gcTime', () => {
      cache = new AuraCacheStore<string>({
        staleTime: 1_000,
        gcSweepInterval: false,
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(DEFAULT_GC_TIME + 1);

      expect(cache.lookup('a')).toEqual({ status: 'missing' });
      expect(cache.size).toBe(0);
    });

    it('keeps entries when gcTime is Infinity in SWR mode', () => {
      cache = new AuraCacheStore<string>({
        staleTime: 1_000,
        gcTime: Infinity,
        gcSweepInterval: false,
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);
      expect(cache.lookup('a')).toEqual({ status: 'stale', value: 'one' });

      jest.advanceTimersByTime(DEFAULT_GC_TIME);
      expect(cache.has('a')).toBe(true);
    });

    it('treats staleTime 0 as stale after the fresh window elapses', () => {
      cache = new AuraCacheStore<string>({ staleTime: 0, gcSweepInterval: false });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1);

      expect(cache.lookup('a')).toEqual({ status: 'stale', value: 'one' });
    });

    it('keeps entries fresh when staleTime is Infinity', () => {
      cache = new AuraCacheStore<string>({
        staleTime: Infinity,
        gcTime: 10_000,
        gcSweepInterval: false,
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(9_000);

      expect(cache.lookup('a')).toEqual({ status: 'fresh', value: 'one' });
    });

    it('marks manual stale without staleTime configured', () => {
      cache = new AuraCacheStore<string>({ gcSweepInterval: false });
      cache.set('a', 'one');
      cache.invalidate('a', 'stale');

      expect(cache.get('a')).toBe('one');
      expect(cache.lookup('a')).toEqual({ status: 'stale', value: 'one' });
    });

    it('isStale removes GC-expired manual stale entries like get and lookup', () => {
      cache = new AuraCacheStore<string>({
        staleTime: 500,
        gcTime: 2_000,
        gcSweepInterval: false,
      });
      cache.set('a', 'one');
      cache.invalidate('a', 'stale');

      expect(cache.isStale('a')).toBe(true);

      jest.advanceTimersByTime(2_001);

      expect(cache.isStale('a')).toBe(false);
      expect(cache.has('a')).toBe(false);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.lookup('a')).toEqual({ status: 'missing' });
      expect(cache.size).toBe(0);
    });
  });

  describe('LRU max', () => {
    it('removes least recently used entry when max is exceeded', () => {
      cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.set('c', 'C');

      expect(cache.has('a')).toBe(false);
      expect(cache.get('b')).toBe('B');
      expect(cache.get('c')).toBe('C');
      expect(cache.size).toBe(2);
    });

    it('promotes accessed keys so they are not removed first', () => {
      cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.get('a');
      cache.set('c', 'C');

      expect(cache.has('b')).toBe(false);
      expect(cache.get('a')).toBe('A');
      expect(cache.get('c')).toBe('C');
    });

    it('does not trim when updating an existing key', () => {
      cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.set('a', 'A2');

      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBe('A2');
      expect(cache.get('b')).toBe('B');
    });

    it('lookup with touch promotes LRU order like get', () => {
      cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.lookup('a', true);
      cache.set('c', 'C');

      expect(cache.has('b')).toBe(false);
      expect(cache.get('a')).toBe('A');
    });

    it('lookup without touch does not promote LRU order', () => {
      cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.lookup('a');
      cache.set('c', 'C');

      expect(cache.has('a')).toBe(false);
      expect(cache.get('b')).toBe('B');
      expect(cache.get('c')).toBe('C');
    });

    it('has does not promote LRU order', () => {
      cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      expect(cache.has('a')).toBe(true);
      cache.set('c', 'C');

      expect(cache.has('a')).toBe(false);
      expect(cache.get('b')).toBe('B');
    });

    it('calls onRemove when LRU removes the least recently used entry', () => {
      const removed: Array<[string, string]> = [];
      cache = new AuraCacheStore<string>({
        max: 2,
        gcSweepInterval: false,
        onRemove: (key, value) => removed.push([key, value]),
      });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.set('c', 'C');

      expect(removed).toEqual([['a', 'A']]);
      expect(cache.size).toBe(2);
    });

    it('list walk completes after LRU promotion via get', () => {
      cache = new AuraCacheStore<string>({ gcTime: 1_000, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.get('a');

      jest.advanceTimersByTime(1_001);

      expect(cache.purgeExpired()).toBe(2);
      expect(cache.size).toBe(0);
    });

    it('clear with onRemove completes after LRU promotion via get', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<string>({
        onRemove: (key) => removed.push(key),
      });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.get('a');

      cache.clear();

      expect(removed.sort()).toEqual(['a', 'b']);
      expect(cache.size).toBe(0);
    });

    it('invalidateMatch remove completes after LRU promotion via lookup touch', () => {
      cache = new AuraCacheStore<string>({ gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.lookup('a', true);

      expect(cache.invalidateMatch(() => true, 'remove')).toBe(2);
      expect(cache.size).toBe(0);
    });
  });

  describe('proactive GC', () => {
    it('purgeExpired returns 0 when gcTime is not configured', () => {
      cache = new AuraCacheStore<string>({ gcSweepInterval: false });
      cache.set('a', 'one');

      expect(cache.purgeExpired()).toBe(0);
      expect(cache.size).toBe(1);
    });

    it('purgeExpired removes expired entries without read', () => {
      cache = new AuraCacheStore<string>({ gcTime: 1_000, gcSweepInterval: false });
      cache.set('a', 'one');
      cache.set('b', 'two');

      jest.advanceTimersByTime(1_001);

      expect(cache.purgeExpired()).toBe(2);
      expect(cache.size).toBe(0);
    });

    it('background sweep removes expired entries', () => {
      cache = new AuraCacheStore<string>({
        gcTime: 1_000,
        gcSweepInterval: 500,
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_501);

      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });

    it('background sweep uses auto interval when gcSweepInterval is omitted', () => {
      cache = new AuraCacheStore<string>({ gcTime: 1_000 });
      cache.set('a', 'one');

      jest.advanceTimersByTime(5_001);

      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });

    it('clear stops background sweep until a new entry is stored', () => {
      cache = new AuraCacheStore<string>({
        gcTime: 1_000,
        gcSweepInterval: 500,
      });
      cache.set('a', 'one');
      cache.clear();

      cache.set('b', 'two');
      jest.advanceTimersByTime(500);
      expect(cache.size).toBe(1);

      jest.advanceTimersByTime(1_001);
      expect(cache.size).toBe(0);
      expect(cache.get('b')).toBeUndefined();
    });

    it('background sweep stops when the last entry is removed', () => {
      cache = new AuraCacheStore<string>({
        gcTime: 10_000,
        gcSweepInterval: 500,
      });
      cache.set('a', 'one');
      cache.delete('a');

      jest.advanceTimersByTime(5_000);
      expect(cache.size).toBe(0);
    });

    it('does not start auto background sweep when gcTime is Infinity', () => {
      cache = new AuraCacheStore<string>({
        staleTime: 1_000,
        gcTime: Infinity,
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(120_000);

      expect(cache.size).toBe(1);
      expect(cache.get('a')).toBe('one');
    });
  });

  describe('peek', () => {
    it('returns value without promoting LRU order', () => {
      cache = new AuraCacheStore<string>({ max: 2, gcSweepInterval: false });
      cache.set('a', 'A');
      cache.set('b', 'B');

      expect(cache.peek('a')).toBe('A');
      cache.set('c', 'C');

      expect(cache.has('a')).toBe(false);
      expect(cache.peek('b')).toBe('B');
      expect(cache.peek('c')).toBe('C');
    });

    it('removes GC-expired entries on peek like has', () => {
      cache = new AuraCacheStore<string>({ gcTime: 1_000, gcSweepInterval: false });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);

      expect(cache.peek('a')).toBeUndefined();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });

    it('calls onRemove when peek removes a GC-expired entry', () => {
      const removed: Array<[string, string]> = [];
      cache = new AuraCacheStore<string>({
        gcTime: 1_000,
        gcSweepInterval: false,
        onRemove: (key, value) => removed.push([key, value]),
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);
      cache.peek('a');

      expect(removed).toEqual([['a', 'one']]);
      expect(cache.size).toBe(0);
    });
  });

  describe('size and keys', () => {
    it('includes GC-expired entries until access or purge', () => {
      cache = new AuraCacheStore<string>({ gcTime: 1_000, gcSweepInterval: false });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);
      cache.set('b', 'two');

      expect(cache.keys().sort()).toEqual(['a', 'b']);
      expect(cache.size).toBe(2);
      expect(cache.has('a')).toBe(false);
      expect(cache.size).toBe(1);
      expect(cache.keys()).toEqual(['b']);
    });

    it('does not call onRemove from size or keys for GC-expired entries', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<string>({
        gcTime: 1_000,
        gcSweepInterval: false,
        onRemove: (key) => removed.push(key),
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);
      cache.set('b', 'two');

      expect(cache.size).toBe(2);
      expect(cache.keys().sort()).toEqual(['a', 'b']);
      expect(removed).toEqual([]);

      expect(cache.purgeExpired()).toBe(1);
      expect(removed).toEqual(['a']);
      expect(cache.size).toBe(1);
    });
  });

  describe('extract', () => {
    it('returns value and removes entry without onRemove', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<string>({ onRemove: (key) => removed.push(key) });
      cache.set('a', 'one');

      expect(cache.extract('a')).toBe('one');
      expect(cache.get('a')).toBeUndefined();
      expect(cache.size).toBe(0);
      expect(removed).toEqual([]);
    });

    it('returns undefined for missing keys', () => {
      cache = new AuraCacheStore<string>();
      expect(cache.extract('missing')).toBeUndefined();
    });

    it('calls onRemove when GC-expired on extract', () => {
      const removed: Array<[string, string]> = [];
      cache = new AuraCacheStore<string>({
        gcTime: 1_000,
        gcSweepInterval: false,
        onRemove: (key, value) => removed.push([key, value]),
      });
      cache.set('a', 'one');

      jest.advanceTimersByTime(1_001);

      expect(cache.extract('a')).toBeUndefined();
      expect(removed).toEqual([['a', 'one']]);
    });
  });

  describe('delete and clear', () => {
    it('delete removes an existing entry and calls onRemove', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<string>({ onRemove: (key) => removed.push(key) });
      cache.set('a', 'one');

      expect(cache.delete('a')).toBe(true);
      expect(cache.get('a')).toBeUndefined();
      expect(removed).toEqual(['a']);
    });

    it('delete returns false for missing keys', () => {
      cache = new AuraCacheStore<string>();
      expect(cache.delete('missing')).toBe(false);
    });

    it('clear removes all entries and calls onRemove for each', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<string>({ onRemove: (key) => removed.push(key) });
      cache.set('a', '1');
      cache.set('b', '2');

      cache.clear();

      expect(cache.size).toBe(0);
      expect(removed).toEqual(['a', 'b']);
    });

    it('destroy releases the store like clear', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<string>({
        gcTime: 1_000,
        gcSweepInterval: 500,
        onRemove: (key) => removed.push(key),
      });
      cache.set('a', '1');

      cache.destroy();

      expect(cache.size).toBe(0);
      expect(removed).toEqual(['a']);
      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('invalidate', () => {
    it('stale policy keeps value readable', () => {
      cache = new AuraCacheStore<number>({ staleTime: 60_000, gcSweepInterval: false });
      cache.set('x', 1);

      cache.invalidate('x', 'stale');

      expect(cache.get('x')).toBe(1);
      expect(cache.isStale('x')).toBe(true);
      expect(cache.size).toBe(1);
    });

    it('remove policy deletes entry', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<number>({
        staleTime: 60_000,
        gcSweepInterval: false,
        onRemove: (key) => removed.push(key),
      });
      cache.set('x', 1);

      cache.invalidate('x', 'remove');

      expect(cache.get('x')).toBeUndefined();
      expect(removed).toEqual(['x']);
    });

    it('returns false when invalidating a missing key', () => {
      cache = new AuraCacheStore<string>();
      expect(cache.invalidate('missing')).toBe(false);
    });

    it('uses default invalidatePolicy when policy is omitted', () => {
      cache = new AuraCacheStore<string>({ invalidatePolicy: 'remove' });
      cache.set('a', 'one');

      expect(cache.invalidate('a')).toBe(true);
      expect(cache.has('a')).toBe(false);
    });

    it('invalidateMatch respects predicate and default policy', () => {
      cache = new AuraCacheStore<string>({
        staleTime: 60_000,
        gcSweepInterval: false,
        invalidatePolicy: 'remove',
      });
      cache.set('data:a', 'A');
      cache.set('data:b', 'B');
      cache.set('content:a', 'HTML');

      const count = cache.invalidateMatch((key) => key.startsWith('data:'));

      expect(count).toBe(2);
      expect(cache.has('data:a')).toBe(false);
      expect(cache.has('content:a')).toBe(true);
    });

    it('invalidateMatch with stale policy marks matching entries', () => {
      cache = new AuraCacheStore<string>({ staleTime: 60_000, gcSweepInterval: false });
      cache.set('data:a', 'A');
      cache.set('content:a', 'HTML');

      expect(cache.invalidateMatch((key) => key.startsWith('data:'), 'stale')).toBe(1);
      expect(cache.isStale('data:a')).toBe(true);
      expect(cache.isStale('content:a')).toBe(false);
    });

    it('invalidateAll with stale policy marks every entry stale', () => {
      cache = new AuraCacheStore<string>({ staleTime: 60_000, gcSweepInterval: false });
      cache.set('a', '1');
      cache.set('b', '2');

      expect(cache.invalidateAll('stale')).toBe(2);
      expect(cache.isStale('a')).toBe(true);
      expect(cache.isStale('b')).toBe(true);
      expect(cache.size).toBe(2);
    });

    it('invalidateAll uses default stale policy when policy is omitted', () => {
      cache = new AuraCacheStore<string>({ staleTime: 60_000, gcSweepInterval: false });
      cache.set('a', '1');
      cache.set('b', '2');

      expect(cache.invalidateAll()).toBe(2);
      expect(cache.isStale('a')).toBe(true);
      expect(cache.isStale('b')).toBe(true);
      expect(cache.size).toBe(2);
    });

    it('invalidateAll with remove policy deletes every entry', () => {
      const removed: string[] = [];
      cache = new AuraCacheStore<string>({ onRemove: (key) => removed.push(key) });
      cache.set('a', '1');
      cache.set('b', '2');

      expect(cache.invalidateAll('remove')).toBe(2);
      expect(cache.size).toBe(0);
      expect(removed).toEqual(['a', 'b']);
    });
  });
});

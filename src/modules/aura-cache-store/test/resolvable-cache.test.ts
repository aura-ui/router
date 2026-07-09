import { AuraResolvableCache } from '../core/aura-resolvable-cache';

describe('ResolvableCache', () => {
  let cache: AuraResolvableCache<string> | undefined;

  afterEach(() => {
    cache?.destroy();
    cache = undefined;
  });

  it('dedupes in-flight loads', async () => {
    cache = new AuraResolvableCache({ gcSweepInterval: false });
    let loads = 0;

    const load = () => {
      loads++;
      return Promise.resolve(`value-${loads}`);
    };

    const [a, b] = await Promise.all([
      cache.resolve('k', load),
      cache.resolve('k', load),
    ]);

    expect(loads).toBe(1);
    expect(a).toBe('value-1');
    expect(b).toBe('value-1');
  });

  it('returns cached entry without calling load', async () => {
    cache = new AuraResolvableCache({ gcSweepInterval: false });
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

  it('uses persist instead of the default set', async () => {
    cache = new AuraResolvableCache({ gcSweepInterval: false });

    await cache.resolve(
      'k',
      async () => 'loaded',
      () => {},
    );

    expect(cache.get('k')).toBeUndefined();
  });

  it('clears rejected in-flight work so callers can retry', async () => {
    cache = new AuraResolvableCache({ gcSweepInterval: false });
    let loads = 0;

    await expect(
      cache.resolve('k', async () => {
        loads++;
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');

    const value = await cache.resolve('k', async () => {
      loads++;
      return 'ok';
    });

    expect(loads).toBe(2);
    expect(value).toBe('ok');
  });

  it('evicts least recently used entry when max exceeded', async () => {
    cache = new AuraResolvableCache({ max: 2, gcTime: Infinity, gcSweepInterval: false });

    await cache.resolve('a', async () => 'A');
    await cache.resolve('b', async () => 'B');
    await cache.resolve('c', async () => 'C');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('B');
    expect(cache.get('c')).toBe('C');
  });

  describe('SWR', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('skips load while the entry is fresh', async () => {
      cache = new AuraResolvableCache({
        staleTime: 1_000,
        gcTime: Infinity,
        gcSweepInterval: false,
      });
      let loads = 0;

      await cache.resolve('k', async () => {
        loads++;
        return 'cached';
      });

      jest.advanceTimersByTime(500);

      const hit = await cache.resolve('k', async () => {
        loads++;
        return 'fresh';
      });

      expect(loads).toBe(1);
      expect(hit).toBe('cached');
    });

    it('returns stale value and revalidates in the background', async () => {
      cache = new AuraResolvableCache({
        staleTime: 1_000,
        gcTime: Infinity,
        gcSweepInterval: false,
      });
      let loads = 0;
      let releaseLoad!: () => void;
      const loadGate = new Promise<void>((resolve) => {
        releaseLoad = resolve;
      });

      await cache.resolve('k', async () => {
        loads++;
        return 'stale-value';
      });

      jest.advanceTimersByTime(1_001);

      const hit = await cache.resolve('k', async () => {
        await loadGate;
        loads++;
        return 'updated';
      });

      expect(hit).toBe('stale-value');
      expect(loads).toBe(1);

      releaseLoad();
      await flushMicrotasks();

      expect(loads).toBe(2);
      expect(cache.get('k')).toBe('updated');
    });

    it('dedupes concurrent stale revalidations', async () => {
      cache = new AuraResolvableCache({
        staleTime: 1_000,
        gcTime: Infinity,
        gcSweepInterval: false,
      });
      let loads = 0;

      await cache.resolve('k', async () => 'stale-value');
      jest.advanceTimersByTime(1_001);

      const load = async () => {
        loads++;
        return `updated-${loads}`;
      };

      const [a, b] = await Promise.all([
        cache.resolve('k', load),
        cache.resolve('k', load),
      ]);

      expect(a).toBe('stale-value');
      expect(b).toBe('stale-value');

      await flushMicrotasks();

      expect(loads).toBe(1);
      expect(cache.get('k')).toBe('updated-1');
    });

    it('ignores background revalidation errors', async () => {
      cache = new AuraResolvableCache({
        staleTime: 1_000,
        gcTime: Infinity,
        gcSweepInterval: false,
      });

      await cache.resolve('k', async () => 'stale-value');
      jest.advanceTimersByTime(1_001);

      const hit = await cache.resolve('k', async () => {
        throw new Error('revalidate failed');
      });

      expect(hit).toBe('stale-value');

      await flushMicrotasks();

      expect(cache.get('k')).toBe('stale-value');
    });
  });
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

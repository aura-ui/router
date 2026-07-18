import {
  DEFAULT_HANDOFF_TTL_MS,
  HandoffCache,
} from '../../core/resource-graph/handoff-cache';

describe('HandoffCache', () => {
  let handoff: HandoffCache | undefined;

  afterEach(() => {
    handoff?.destroy();
    handoff = undefined;
  });

  it('dedupes in-flight loads for the same key', async () => {
    handoff = new HandoffCache();
    let loads = 0;

    const load = () => {
      loads++;
      return Promise.resolve(`value-${loads}`);
    };

    const [a, b] = await Promise.all([
      handoff.resolve('k', load),
      handoff.resolve('k', load),
    ]);

    expect(loads).toBe(1);
    expect(a).toBe('value-1');
    expect(b).toBe('value-1');
  });

  it('returns settled value within TTL without calling load again', async () => {
    handoff = new HandoffCache();
    let loads = 0;

    await handoff.resolve('k', async () => {
      loads++;
      return 'warm';
    });

    const hit = await handoff.resolve('k', async () => {
      loads++;
      return 'cold';
    });

    expect(loads).toBe(1);
    expect(hit).toBe('warm');
    expect(handoff.get('k')).toBe('warm');
  });

  it('expires after TTL and loads again', async () => {
    jest.useFakeTimers();
    handoff = new HandoffCache({ ttl: 1_000 });
    let loads = 0;

    await handoff.resolve('k', async () => {
      loads++;
      return 'first';
    });

    jest.advanceTimersByTime(1_001);

    const next = await handoff.resolve('k', async () => {
      loads++;
      return 'second';
    });

    expect(loads).toBe(2);
    expect(next).toBe('second');

    jest.useRealTimers();
  });

  it('uses DEFAULT_HANDOFF_TTL_MS when ttl is omitted', async () => {
    jest.useFakeTimers();
    handoff = new HandoffCache();
    let loads = 0;

    await handoff.resolve('k', async () => {
      loads++;
      return 'v';
    });

    jest.advanceTimersByTime(DEFAULT_HANDOFF_TTL_MS);
    expect(
      await handoff.resolve('k', async () => {
        loads++;
        return 'still-fresh';
      }),
    ).toBe('v');
    expect(loads).toBe(1);

    jest.advanceTimersByTime(1);
    expect(
      await handoff.resolve('k', async () => {
        loads++;
        return 'expired';
      }),
    ).toBe('expired');
    expect(loads).toBe(2);

    jest.useRealTimers();
  });

  it('join attaches to in-flight resolve without starting a second load', async () => {
    handoff = new HandoffCache();
    let loads = 0;
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });

    const loading = handoff.resolve('k', async () => {
      loads++;
      return gate;
    });

    const joined = handoff.join('k');
    expect(joined).toBeDefined();
    expect(loads).toBe(1);

    release('warm');
    await expect(Promise.all([loading, joined])).resolves.toEqual(['warm', 'warm']);
    expect(loads).toBe(1);
  });

  it('join returns settled value and undefined when missing', async () => {
    handoff = new HandoffCache();
    expect(handoff.join('missing')).toBeUndefined();

    await handoff.resolve('k', async () => 'settled');
    await expect(handoff.join('k')).resolves.toBe('settled');
  });

  it('clears rejected in-flight work so callers can retry', async () => {
    handoff = new HandoffCache();
    let loads = 0;

    await expect(
      handoff.resolve('k', async () => {
        loads++;
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');

    const value = await handoff.resolve('k', async () => {
      loads++;
      return 'ok';
    });

    expect(loads).toBe(2);
    expect(value).toBe('ok');
  });

  it('onSettled is an extra write; handoff still keeps the settled value', async () => {
    const long = new Map<string, string>();
    handoff = new HandoffCache({
      onSettled: (key, value) => {
        long.set(key, value as string);
      },
    });

    await handoff.resolve('k', async () => 'payload');

    expect(handoff.get('k')).toBe('payload');
    expect(long.get('k')).toBe('payload');
  });

  it('invalidate removes a key by default', async () => {
    handoff = new HandoffCache();
    await handoff.resolve('a', async () => 1);
    await handoff.resolve('b', async () => 2);

    expect(handoff.invalidate('a')).toBe(true);
    expect(handoff.get('a')).toBeUndefined();
    expect(handoff.get('b')).toBe(2);
  });

  it('destroy clears the store', async () => {
    handoff = new HandoffCache();
    await handoff.resolve('k', async () => 'x');
    handoff.destroy();

    handoff = new HandoffCache();
    let loads = 0;
    await handoff.resolve('k', async () => {
      loads++;
      return 'y';
    });
    expect(loads).toBe(1);
  });

  describe('acquire / release (work leases)', () => {
    it('shares one workSignal across concurrent acquires', () => {
      handoff = new HandoffCache();
      const a = handoff.acquire('k', 'speculative');
      const b = handoff.acquire('k', 'navigation');

      expect(a.workSignal).toBe(b.workSignal);
      expect(a.workSignal.aborted).toBe(false);
      expect(handoff.waiterCount('k')).toBe(2);

      a.release();
      b.release();
    });

    it('does not abort work when the last waiter is speculative-only', () => {
      handoff = new HandoffCache();
      const lease = handoff.acquire('k', 'speculative');
      const { workSignal } = lease;

      lease.release();

      expect(workSignal.aborted).toBe(false);
      expect(handoff.waiterCount('k')).toBe(0);

      // Next acquire reuses the same live generation (hover again → join).
      const again = handoff.acquire('k', 'speculative');
      expect(again.workSignal).toBe(workSignal);
      again.release();
    });

    it('aborts work when the last navigation waiter leaves alone', () => {
      handoff = new HandoffCache();
      const lease = handoff.acquire('k', 'navigation');
      const { workSignal } = lease;

      lease.release();

      expect(workSignal.aborted).toBe(true);
      expect(handoff.waiterCount('k')).toBe(0);
    });

    it('keeps work alive until the last of several navigation waiters leaves', () => {
      handoff = new HandoffCache();
      const first = handoff.acquire('k', 'navigation');
      const second = handoff.acquire('k', 'navigation');
      const { workSignal } = first;

      first.release();
      expect(workSignal.aborted).toBe(false);
      expect(handoff.waiterCount('k')).toBe(1);

      second.release();
      expect(workSignal.aborted).toBe(true);
    });

    it('aborts after navigation interest even if speculative releases last', () => {
      handoff = new HandoffCache();
      const prefetch = handoff.acquire('k', 'speculative');
      const navigation = handoff.acquire('k', 'navigation');
      const { workSignal } = prefetch;

      // Click away first, mouseout later — still abort (seenNavigation).
      navigation.release();
      expect(workSignal.aborted).toBe(false);

      prefetch.release();
      expect(workSignal.aborted).toBe(true);
    });

    it('starts a new work generation after abort', () => {
      handoff = new HandoffCache();
      const first = handoff.acquire('k', 'navigation');
      const oldSignal = first.workSignal;
      first.release();
      expect(oldSignal.aborted).toBe(true);

      const next = handoff.acquire('k', 'navigation');
      expect(next.workSignal).not.toBe(oldSignal);
      expect(next.workSignal.aborted).toBe(false);
      next.release();
    });

    it('release is idempotent', () => {
      handoff = new HandoffCache();
      const lease = handoff.acquire('k', 'navigation');
      lease.release();
      lease.release();
      expect(lease.workSignal.aborted).toBe(true);
      expect(handoff.waiterCount('k')).toBe(0);
    });

    it('destroy aborts outstanding work leases', () => {
      handoff = new HandoffCache();
      const lease = handoff.acquire('k', 'speculative');
      handoff.destroy();
      expect(lease.workSignal.aborted).toBe(true);
      handoff = undefined;
    });
  });
});

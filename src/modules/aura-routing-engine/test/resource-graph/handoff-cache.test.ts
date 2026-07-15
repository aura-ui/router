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
});

import { retry } from '../async/retry';

describe('retry', () => {
  it('returns the result on the first successful attempt', async () => {
    let runs = 0;

    const value = await retry(async () => {
      runs++;
      return 'ok';
    });

    expect(value).toBe('ok');
    expect(runs).toBe(1);
  });

  it('retries until the callback succeeds', async () => {
    let runs = 0;

    const value = await retry(async () => {
      runs++;
      if (runs < 3) throw new Error(`fail-${runs}`);
      return 'ok';
    }, { attempts: 3 });

    expect(value).toBe('ok');
    expect(runs).toBe(3);
  });

  it('throws the last error when attempts are exhausted', async () => {
    let runs = 0;

    await expect(
      retry(async () => {
        runs++;
        throw new Error(`fail-${runs}`);
      }, { attempts: 2 }),
    ).rejects.toThrow('fail-2');

    expect(runs).toBe(2);
  });

  it('respects shouldRetry', async () => {
    let runs = 0;

    await expect(
      retry(async () => {
        runs++;
        throw new Error('fatal');
      }, {
        attempts: 3,
        shouldRetry: (error) => (error as Error).message !== 'fatal',
      }),
    ).rejects.toThrow('fatal');

    expect(runs).toBe(1);
  });

  it('waits delay ms between attempts', async () => {
    jest.useFakeTimers();
    let runs = 0;

    const promise = retry(async () => {
      runs++;
      if (runs < 2) throw new Error('retry');
      return 'ok';
    }, { attempts: 2, delay: 100 });

    await Promise.resolve();
    expect(runs).toBe(1);

    await jest.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toBe('ok');
    expect(runs).toBe(2);

    jest.useRealTimers();
  });

  it('rejects when the signal aborts before an attempt', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      retry(async () => 'ok', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(DOMException);
  });

  it('rejects when the signal aborts during delay', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    let runs = 0;

    const promise = retry(async () => {
      runs++;
      throw new Error('retry');
    }, { attempts: 2, delay: 100, signal: controller.signal });

    await Promise.resolve();
    expect(runs).toBe(1);

    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(DOMException);
    expect(runs).toBe(1);

    jest.useRealTimers();
  });

  it('throws when attempts is less than 1', async () => {
    await expect(retry(async () => 'ok', { attempts: 0 })).rejects.toThrow(RangeError);
  });

  it('throws when delay is negative', async () => {
    await expect(retry(async () => 'ok', { delay: -1 })).rejects.toThrow(RangeError);
  });

  it('throws when backoffMultiplier is invalid', async () => {
    await expect(retry(async () => 'ok', { backoffMultiplier: -1 })).rejects.toThrow(RangeError);
    await expect(retry(async () => 'ok', { backoffMultiplier: Number.NaN })).rejects.toThrow(RangeError);
  });

  it('applies exponential backoff between attempts', async () => {
    jest.useFakeTimers();
    let runs = 0;

    const promise = retry(async () => {
      runs++;
      if (runs < 3) throw new Error('retry');
      return 'ok';
    }, { attempts: 3, delay: 100, backoffMultiplier: 2 });

    await Promise.resolve();
    expect(runs).toBe(1);

    await jest.advanceTimersByTimeAsync(99);
    expect(runs).toBe(1);

    await jest.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(runs).toBe(2);

    await jest.advanceTimersByTimeAsync(199);
    expect(runs).toBe(2);

    await jest.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('ok');
    expect(runs).toBe(3);

    jest.useRealTimers();
  });

  it('skips sleep when computed delay is zero', async () => {
    jest.useFakeTimers();
    let runs = 0;

    const promise = retry(async () => {
      runs++;
      if (runs < 2) throw new Error('retry');
      return 'ok';
    }, { attempts: 2, delay: 0, backoffMultiplier: 2 });

    await expect(promise).resolves.toBe('ok');
    expect(runs).toBe(2);
    expect(jest.getTimerCount()).toBe(0);

    jest.useRealTimers();
  });
});

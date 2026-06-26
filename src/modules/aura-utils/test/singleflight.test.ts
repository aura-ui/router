import { Singleflight } from '../async/singleflight';

describe('Singleflight', () => {
  it('dedupes concurrent runs for the same key', async () => {
    const singleflight = new Singleflight<string, string>();
    let runs = 0;

    const run = () => {
      runs++;
      return Promise.resolve(`value-${runs}`);
    };

    const [a, b] = await Promise.all([
      singleflight.do('k', run),
      singleflight.do('k', run),
    ]);

    expect(runs).toBe(1);
    expect(a).toBe('value-1');
    expect(b).toBe('value-1');
  });

  it('runs again after the in-flight promise settles', async () => {
    const singleflight = new Singleflight<string, string>();
    let runs = 0;

    await singleflight.do('k', async () => {
      runs++;
      return 'first';
    });

    const second = await singleflight.do('k', async () => {
      runs++;
      return 'second';
    });

    expect(runs).toBe(2);
    expect(second).toBe('second');
  });

  it('keeps separate in-flight work per key', async () => {
    const singleflight = new Singleflight<string, string>();
    let runs = 0;

    const [a, b] = await Promise.all([
      singleflight.do('a', async () => {
        runs++;
        return 'A';
      }),
      singleflight.do('b', async () => {
        runs++;
        return 'B';
      }),
    ]);

    expect(runs).toBe(2);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });

  it('clears rejected in-flight work so callers can retry', async () => {
    const singleflight = new Singleflight<string, string>();
    let runs = 0;

    await expect(
      singleflight.do('k', async () => {
        runs++;
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');

    const value = await singleflight.do('k', async () => {
      runs++;
      return 'ok';
    });

    expect(runs).toBe(2);
    expect(value).toBe('ok');
  });

  it('delete and clear drop pending entries without cancelling work', async () => {
    const singleflight = new Singleflight<string, string>();
    let runs = 0;

    const first = singleflight.do('k', async () => {
      runs++;
      return 'first';
    });

    singleflight.delete('k');

    const second = await singleflight.do('k', async () => {
      runs++;
      return 'second';
    });

    expect(await first).toBe('first');
    expect(second).toBe('second');
    expect(runs).toBe(2);

    singleflight.clear();
    await singleflight.do('k', async () => {
      runs++;
      return 'third';
    });

    expect(runs).toBe(3);
  });
});

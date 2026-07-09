import { runConcurrent } from '../../async/run-concurrent';

describe('runConcurrent', () => {
  it('runs all items', async () => {
    const seen: number[] = [];

    await runConcurrent([1, 2, 3], 2, async (item) => {
      seen.push(item);
    });

    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('limits parallel execution', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await runConcurrent([1, 2, 3, 4, 5], 2, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
    });

    expect(maxInFlight).toBe(2);
  });

  it('stops scheduling when signal is aborted', async () => {
    const controller = new AbortController();
    let runs = 0;

    const pending = runConcurrent([1, 2, 3, 4, 5], 1, async () => {
      runs++;
      if (runs === 2) controller.abort();
      await new Promise((r) => setTimeout(r, 5));
    }, controller.signal);

    await pending;

    expect(runs).toBeLessThan(5);
  });

  it('no-ops for an empty list', async () => {
    const run = jest.fn();
    await runConcurrent([], 3, run);
    expect(run).not.toHaveBeenCalled();
  });
});

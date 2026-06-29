import { PrefetchRunStore } from '../../core/prefetch/store';

describe('PrefetchRunStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs intent immediately when delay is zero', () => {
    const run = jest.fn();
    const store = new PrefetchRunStore({ tapDelayMs: 0 });

    store.scheduleIntent('/page', 'tap', run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(store.isScheduled('/page')).toBe(false);
  });

  it('debounces intent scheduling and replaces pending timer', () => {
    const run = jest.fn();
    const store = new PrefetchRunStore({ intentDelayMs: 100 });

    store.scheduleIntent('/page', 'intent', run);
    store.scheduleIntent('/page', 'intent', run);

    jest.advanceTimersByTime(99);
    expect(run).not.toHaveBeenCalled();
    expect(store.isScheduled('/page')).toBe(true);

    jest.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.isScheduled('/page')).toBe(false);
  });

  it('cancels scheduled timer for a href', () => {
    const run = jest.fn();
    const store = new PrefetchRunStore({ intentDelayMs: 100 });

    store.scheduleIntent('/page', 'intent', run);
    store.cancelIntent('/page');

    jest.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    expect(store.isScheduled('/page')).toBe(false);
  });

  it('cancels all scheduled timers and aborts inflight runs', () => {
    const run = jest.fn();
    const abort = new AbortController();
    const store = new PrefetchRunStore({ intentDelayMs: 100 });

    store.scheduleIntent('/a', 'intent', run);
    store.setInflight('/b', { promise: Promise.resolve(), abort });

    const aborted = jest.fn();
    abort.signal.addEventListener('abort', aborted);

    store.cancelIntent();

    jest.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    expect(aborted).toHaveBeenCalled();
    expect(store.isInflight('/b')).toBe(false);
  });

  it('tracks inflight state and successful completion', () => {
    const store = new PrefetchRunStore({});
    const abort = new AbortController();

    expect(store.isInflight('/page')).toBe(false);
    expect(store.lastCompletedAt('/page')).toBeUndefined();

    store.setInflight('/page', { promise: Promise.resolve(), abort });
    expect(store.isInflight('/page')).toBe(true);

    store.deleteInflight('/page', abort);
    store.recordSuccess('/page');

    expect(store.isInflight('/page')).toBe(false);
    expect(store.lastCompletedAt('/page')).toBeDefined();
  });

  it('does not delete inflight entry when abort controller mismatches', () => {
    const store = new PrefetchRunStore({});
    const first = new AbortController();
    const second = new AbortController();

    store.setInflight('/page', { promise: Promise.resolve(), abort: first });
    store.deleteInflight('/page', second);

    expect(store.isInflight('/page')).toBe(true);
  });

  it('destroy clears records and pending work', () => {
    const run = jest.fn();
    const store = new PrefetchRunStore({ intentDelayMs: 100 });

    store.scheduleIntent('/page', 'intent', run);
    store.recordSuccess('/page');
    store.destroy();

    jest.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    expect(store.lastCompletedAt('/page')).toBeUndefined();
  });

  it('cancelIntent ignores invalid href without touching inflight runs', () => {
    const store = new PrefetchRunStore({});
    const abort = new AbortController();
    const aborted = jest.fn();
    abort.signal.addEventListener('abort', aborted);

    store.setInflight('/page', { promise: Promise.resolve(), abort });
    store.cancelIntent('https://example.com');

    expect(aborted).not.toHaveBeenCalled();
    expect(store.isInflight('/page')).toBe(true);

    store.cancelIntent('/page');
    expect(aborted).toHaveBeenCalled();
    expect(store.isInflight('/page')).toBe(true);
  });
});

import { awaitUntilAbort } from '../../async/await-until-abort';
import { promiseWithResolvers } from '../../async/promises';

describe('awaitUntilAbort', () => {
  it('resolves with the promise value when signal stays open', async () => {
    await expect(awaitUntilAbort(Promise.resolve(42), new AbortController().signal)).resolves.toBe(
      42,
    );
  });

  it('rejects immediately when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(awaitUntilAbort(Promise.resolve(1), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('rejects the waiter on abort without cancelling the underlying promise', async () => {
    const { promise, resolve } = promiseWithResolvers();
    const controller = new AbortController();

    const waiter = awaitUntilAbort(promise, controller.signal);
    controller.abort();

    await expect(waiter).rejects.toMatchObject({ name: 'AbortError' });

    resolve('done');
    await expect(promise).resolves.toBe('done');
  });

  it('lets a second waiter observe the shared settle after the first aborts', async () => {
    const { promise, resolve } = promiseWithResolvers();
    const first = new AbortController();

    const abortedWaiter = awaitUntilAbort(promise, first.signal);
    first.abort();
    await expect(abortedWaiter).rejects.toMatchObject({ name: 'AbortError' });

    const joined = awaitUntilAbort(promise, new AbortController().signal);
    resolve({ id: 1 });

    await expect(joined).resolves.toEqual({ id: 1 });
  });

  it('propagates underlying rejection when signal is not aborted', async () => {
    const failure = new Error('load failed');
    await expect(
      awaitUntilAbort(Promise.reject(failure), new AbortController().signal),
    ).rejects.toBe(failure);
  });
});

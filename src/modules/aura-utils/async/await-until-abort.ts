import { onAbort } from './on-abort';

function abortReason(signal: AbortSignal): unknown {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Aborted', 'AbortError');
}

/**
 * Await `promise` until it settles or `signal` aborts.
 *
 * Abort rejects **this waiter only** — it does not cancel `promise` or other waiters.
 * Use for shared/singleflight work (handoff, `import::`) where caller cancel means
 * “I no longer need the result”, not “tear down the underlying load”.
 */
export function awaitUntilAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortReason(signal));
  }

  return new Promise<T>((resolve, reject) => {
    const clearAbort = onAbort(signal, () => reject(abortReason(signal)));

    const finish = (action: () => void): void => {
      clearAbort();
      // Listener is gone; if abort landed in this gap, still prefer AbortError.
      if (signal.aborted) {
        reject(abortReason(signal));
        return;
      }
      action();
    };

    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

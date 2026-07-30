/** Race a promise against `AbortSignal` abort. */
export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  }
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    }),
  ]);
}

export type GatedLoader<T> = {
  loader: (ctx: { signal?: AbortSignal }) => Promise<T>;
  release: () => void;
};

/**
 * Async loader that blocks until {@link GatedLoader.release} is called.
 * Honors `ctx.signal` abort while waiting.
 */
export function createGatedLoader<T>(payload: T): GatedLoader<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    loader: async (ctx) => {
      await raceAbort(gate, ctx.signal);
      return payload;
    },
    release,
  };
}

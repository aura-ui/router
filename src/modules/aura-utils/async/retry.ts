export type RetryOptions = {
  /** Total attempts including the first try. Default `2`. */
  attempts?: number;
  /** Delay before each retry in ms. Default `0`. */
  delay?: number;
  /** Return `false` to stop retrying. Default retries every error. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Aborted before or between attempts rejects the retry. */
  signal?: AbortSignal;
};

/**
 * Runs an async function and retries it when it rejects.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 2;
  const delay = options.delay ?? 0;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const { signal } = options;

  if (attempts < 1) {
    throw new RangeError('retry: attempts must be >= 1');
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    throwIfAborted(signal);

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      if (delay > 0) {
        await sleep(delay, signal);
      }
    }
  }

  throw lastError;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw abortError(signal);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Aborted', 'AbortError');
}

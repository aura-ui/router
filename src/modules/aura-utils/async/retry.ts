export type RetryOptions = {
  /** Total attempts including the first try. Default `2`. */
  attempts?: number;
  /** Delay before each retry in ms. Default `0`. */
  delay?: number;
  /** Multiplier for exponential backoff. Default `1` (no backoff). */
  backoffMultiplier?: number;
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
  const baseDelay = options.delay ?? 0;
  const backoffMultiplier = options.backoffMultiplier ?? 1;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const { signal } = options;

  if (attempts < 1) {
    throw new RangeError('retry: attempts must be >= 1');
  }
  if (baseDelay < 0) {
    throw new RangeError('retry: delay must be >= 0');
  }
  if (backoffMultiplier < 0 || !Number.isFinite(backoffMultiplier)) {
    throw new RangeError('retry: backoffMultiplier must be a non-negative finite number');
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) {
      throw abortError(signal);
    }

    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      const delay = baseDelay * (backoffMultiplier ** (attempt - 1));
      if (delay > 0) {
        await sleep(delay, signal);
      }
    }
  }

  throw new Error('retry: exhausted attempts without result');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Aborted', 'AbortError');
}

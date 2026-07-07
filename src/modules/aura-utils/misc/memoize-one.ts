/** Memoized unary function plus cache utilities. */
export type MemoizedOneFn<F extends (arg: any) => any> = F & {
  /** Memoization cache keyed by hash result (`string` or `null`). */
  cache: Map<string | null, ReturnType<F>>;
  /** Clears all cached entries. */
  clear: () => void;
  /** Returns whether a cache entry exists for the given argument. */
  has: (arg: Parameters<F>[0]) => boolean;
};

/**
 * Hash function for {@link memoizeOne}.
 *
 * - `string` — cache key;
 * - `null` — valid key;
 * - `undefined` — hash cannot be built, result is not memoized.
 */
export type MemoOneHashFn<T> = (arg: T) => string | null | undefined;

function hashOneArg<T>(arg: T): string | null | undefined {
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }
  return;
}

/**
 * Fast memoization for a single-argument function (no rest `args` array).
 *
 * Prefer over {@link memoizeFn} for hot unary paths (e.g. match by `pathname`).
 * When `hashFn` returns `undefined`, the original function runs on every call.
 *
 * @param fn - Unary function to memoize.
 * @param hashFn - Optional hash builder; primitive `string` / `number` / `boolean` by default.
 */
export function memoizeOne<F extends (arg: any) => any>(
  fn: F,
  hashFn: MemoOneHashFn<Parameters<F>[0]> = hashOneArg,
): MemoizedOneFn<F> {
  type Arg = Parameters<F>[0];
  const cache = new Map<string | null, ReturnType<F>>();

  function memo(this: ThisParameterType<F>, arg: Arg): ReturnType<F> {
    const key = hashFn(arg);
    if (typeof key !== 'string' && key !== null) {
      return fn.call(this, arg);
    }
    let value = cache.get(key) as ReturnType<F>;
    if (value === undefined && !cache.has(key)) {
      value = fn.call(this, arg);
      cache.set(key, value);
    }
    return value;
  }

  memo.cache = cache;
  memo.clear = (): void => cache.clear();
  memo.has = (arg: Arg): boolean => {
    const key = hashFn(arg);
    return key !== undefined && cache.has(key);
  };

  return memo as MemoizedOneFn<F>;
}

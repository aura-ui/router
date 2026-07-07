import type { AnyToAnyFnSignature } from './functions';

/** Memoized function: original callable plus cache utilities. */
export type MemoizedFn<T extends AnyToAnyFnSignature> = T & {
  /** Memoization cache keyed by hash result (`string` or `null`). */
  cache: Map<string | null, ReturnType<T>>;
  /** Clears all cached entries. */
  clear: () => void;
  /** Returns whether a cache entry exists for the given arguments. */
  has: (...args: Parameters<T>) => boolean;
};

/**
 * Hash function for {@link memoizeFn}.
 * Signature matches the memoized function arguments.
 *
 * - `string` — cache key;
 * - `null` — valid key (e.g. zero-argument calls);
 * - `undefined` — hash cannot be built, result is not memoized.
 */
export type MemoHashFn<F extends AnyToAnyFnSignature = AnyToAnyFnSignature> = (
  ...args: Parameters<F>
) => string | null | undefined;

/**
 * Builds a cache key from a call arguments tuple (no rest/spread round-trip).
 * Used internally by {@link defaultArgsToHashFn} and the default memoization fast path.
 */
function hashFirstArg(args: unknown[]): string | null | undefined {
  if (args.length === 0) return null;
  if (args.length > 1) return;
  const v = args[0];
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return;
}

/**
 * Default arguments hash function.
 * Supports only 0–1 arguments with a primitive type (`string`, `number`, `boolean`).
 */
export function defaultArgsToHashFn(...args: unknown[]): string | null | undefined {
  return hashFirstArg(args);
}

/**
 * Memoizes `fn` by caching its return value per argument hash.
 *
 * When `hashFn` returns `undefined`, the original function is invoked on every call.
 * Preserves `this` binding (safe for methods).
 *
 * @param fn - Function to memoize.
 * @param hashFn - Optional hash builder; {@link defaultArgsToHashFn} by default.
 * @see MemoHashFn
 */
export function memoizeFn<F extends AnyToAnyFnSignature>(
  fn: F,
  hashFn: MemoHashFn<F> = defaultArgsToHashFn,
): MemoizedFn<F> {
  const cache = new Map<string | null, ReturnType<F>>();

  function invokeFn(this: ThisParameterType<F>, args: Parameters<F>): ReturnType<F> {
    if (args.length === 0) return fn.call(this);
    if (args.length === 1) return fn.call(this, args[0]);
    return fn.apply(this, args);
  }

  function readCache(this: ThisParameterType<F>, key: string | null, args: Parameters<F>): ReturnType<F> {
    let value = cache.get(key) as ReturnType<F>;
    if (value === undefined && !cache.has(key)) {
      value = invokeFn.call(this, args);
      cache.set(key, value);
    }
    return value;
  }

  const memo = (
    hashFn === defaultArgsToHashFn
      ? createDefaultMemo(cache, readCache, invokeFn)
      : createCustomMemo(cache, hashFn, readCache, invokeFn)
  ) as MemoizedFn<F>;

  memo.cache = cache;
  memo.clear = (): void => cache.clear();
  return memo;
}

/** Default-hash memo implementation: `hashFirstArg` without spread on the hot path. */
function createDefaultMemo<F extends AnyToAnyFnSignature>(
  cache: Map<string | null, ReturnType<F>>,
  readCache: (this: ThisParameterType<F>, key: string | null, args: Parameters<F>) => ReturnType<F>,
  invokeFn: (this: ThisParameterType<F>, args: Parameters<F>) => ReturnType<F>,
) {
  function memo(this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
    const key = hashFirstArg(args);
    if (typeof key === 'string' || key === null) {
      return readCache.call(this, key, args);
    }
    return invokeFn.call(this, args);
  }

  memo.has = (...args: Parameters<F>): boolean => {
    const key = hashFirstArg(args);
    return key !== undefined && cache.has(key);
  };

  return memo;
}

/** Custom-hash memo implementation: delegates key building to `hashFn`. */
function createCustomMemo<F extends AnyToAnyFnSignature>(
  cache: Map<string | null, ReturnType<F>>,
  hashFn: MemoHashFn<F>,
  readCache: (this: ThisParameterType<F>, key: string | null, args: Parameters<F>) => ReturnType<F>,
  invokeFn: (this: ThisParameterType<F>, args: Parameters<F>) => ReturnType<F>,
) {
  function memo(this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
    const key = hashFn(...args);
    if (typeof key === 'string' || key === null) {
      return readCache.call(this, key, args);
    }
    return invokeFn.call(this, args);
  }

  memo.has = (...args: Parameters<F>): boolean => {
    const key = hashFn(...args);
    return key !== undefined && cache.has(key);
  };

  return memo;
}

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
 * Default arguments hash function.
 * Supports only 0–1 arguments with a primitive type (`string`, `number`, `boolean`).
 */
export function defaultArgsToHashFn(...args: unknown[]): string | null | undefined {
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
 * Memoizes `fn` by caching its return value per argument hash.
 *
 * When `hashFn` returns `undefined`, the original function is invoked on every call.
 * Preserves `this` binding (safe for methods).
 *
 * For hot single-argument paths prefer `memoizeOne` from `./memoize-one`.
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

  function memo(this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
    const key = hashFn(...args);
    if (typeof key !== 'string' && key !== null) {
      console.warn(`[Aura] memoize("${fn.name}"): arguments could not be hashed; result not cached.`);
      return fn.apply(this, args);
    }
    let value = cache.get(key) as ReturnType<F>;
    if (value === undefined && !cache.has(key)) {
      value = fn.apply(this, args);
      cache.set(key, value);
    }
    return value;
  }

  memo.cache = cache;
  memo.clear = (): void => cache.clear();
  memo.has = (...args: Parameters<F>): boolean => {
    const key = hashFn(...args);
    return key !== undefined && cache.has(key);
  };

  return memo as MemoizedFn<F>;
}

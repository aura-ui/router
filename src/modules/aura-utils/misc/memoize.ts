import type { AnyToAnyFnSignature } from './functions';

export type MemoizedFn<T extends AnyToAnyFnSignature> = T & {
  cache: Map<string | null, ReturnType<T>>;
  clear: () => void;
  has: (...args: Parameters<T>) => boolean;
};

export function memoizeFn<F extends AnyToAnyFnSignature>(fn: F, hashFn: MemoHashFn<F> = normalizeCacheKeyArg): MemoizedFn<F> {
  const cache = new Map<string | null, ReturnType<F>>();

  function memo(this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
    const key = hashFn(...args);
    if (key !== null && typeof key !== 'string') return fn.apply(this, args);
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
    return key === undefined ? false : cache.has(key);
  };
  return memo as MemoizedFn<F>;
}

export type MemoHashFn<F extends AnyToAnyFnSignature = AnyToAnyFnSignature> = (...args: Parameters<F>) => string | null | undefined;

export function normalizeCacheKeyArg(...args: unknown[]): string | null | undefined {
  if (args.length === 0) return null;
  if (args.length > 1) return;
  const v = args[0];
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return;
}
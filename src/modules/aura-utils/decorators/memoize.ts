import { hashOneArg, memoizeOne } from '../misc/memoize-one';

function toMemoizedMethod<F extends (...args: any[]) => any>(original: F): F {
  type First = Parameters<F>[0];
  let invokeArgs: Parameters<F> | undefined;

  const cached = memoizeOne(function (this: ThisParameterType<F>, first: First): ReturnType<F> {
    return original.apply(this, invokeArgs!);
  });

  return function (this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
    const key = hashOneArg(args[0]);
    if (typeof key !== 'string' && key !== null) {
      return original.apply(this, args);
    }
    invokeArgs = args;
    return cached.call(this, args[0]);
  } as F;
}

function memoizeMethod<F extends (...args: any[]) => any>(
  originalMethod: F,
  prop: string | symbol,
): F {
  return function (this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
    const memo = toMemoizedMethod(originalMethod);
    Object.defineProperty(this, prop, { value: memo, writable: true, configurable: true });
    return memo.apply(this, args);
  } as F;
}

/** Декоратор метода: lazy per-instance кеш, ключ — первый аргумент ({@link memoizeOne}). */
export function memoize() {
  return function <This, Args extends unknown[], R>(
    target: This,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: Args) => R>,
  ): TypedPropertyDescriptor<(...args: Args) => R> {
    const original = descriptor.value;
    if (!original) return descriptor;

    descriptor.value = (
      typeof target === 'function'
        ? toMemoizedMethod(original)
        : memoizeMethod(original, propertyKey)
    ) as (...args: Args) => R;

    return descriptor;
  };
}

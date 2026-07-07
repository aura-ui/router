import { hashOneArg, memoizeOne } from '../misc/memoize-one';

const defineOwn = (obj: object, prop: string | symbol, value: unknown): void => {
  Object.defineProperty(obj, prop, { value, writable: true, configurable: true });
};

function memoizeMethodFn<F extends (...args: any[]) => any>(original: F): F {
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

function memoizeGetter(getter: (this: any) => any, prop: string | symbol) {
  return function (this: any) {
    const value = getter.call(this);
    defineOwn(this, prop, value);
    return value;
  };
}

function memoizeMethod(method: (...args: any[]) => any, prop: string | symbol) {
  return function (this: any, ...args: any[]) {
    const memo = memoizeMethodFn(method);
    defineOwn(this, prop, memo);
    return memo.apply(this, args);
  };
}

function memoizeStaticGetter(getter: (this: any) => any) {
  const cached = memoizeOne(function (this: any, _: null) {
    return getter.call(this);
  }, () => null);
  return function (this: any) {
    return cached.call(this, null);
  };
}

/** Декоратор метода или геттера: lazy per-instance кеш ({@link memoizeOne} для методов). */
export function memoize() {
  return function (target: object, prop: string | symbol, descriptor: PropertyDescriptor) {
    if (!descriptor || (typeof descriptor.get !== 'function' && typeof descriptor.value !== 'function')) {
      throw new TypeError('Only get accessors or class methods can be decorated via @memoize');
    }

    if (typeof target !== 'function') {
      typeof descriptor.get === 'function' && (descriptor.get = memoizeGetter(descriptor.get, prop));
      typeof descriptor.value === 'function' && (descriptor.value = memoizeMethod(descriptor.value, prop));
    } else {
      typeof descriptor.get === 'function' && (descriptor.get = memoizeStaticGetter(descriptor.get));
      typeof descriptor.value === 'function' && (descriptor.value = memoizeMethodFn(descriptor.value));
    }

    return descriptor;
  };
}

import { memoizeFn } from '../misc/memoize';
import { hashOneArg, memoizeOne } from '../misc/memoize-one';

function createMemoizedMethodForOneArg<F extends (...args: any[]) => any>(original: F): F {
  type First = Parameters<F>[0];
  let invokeArgs: Parameters<F> | undefined;

  const cached = memoizeOne(function (this: ThisParameterType<F>, _first: First): ReturnType<F> {
    return original.apply(this, invokeArgs!);
  });

  return function (this: ThisParameterType<F>, ...args: Parameters<F>): ReturnType<F> {
    const first = args[0];
    const key = hashOneArg(first);
    if (typeof key !== 'string' && key !== null) {
      return original.apply(this, args);
    }
    if (!cached.has(first)) {
      invokeArgs = args;
    }
    return cached.call(this, first);
  } as F;
}

function memoizeInstanceGetter(getter: (this: any) => any, prop: string | symbol) {
  return function (this: any) {
    const value = getter.call(this);
    Object.defineProperty(this, prop, { value, writable: true, configurable: true });
    return value;
  };
}

function memoizeInstanceMethod(method: (...args: any[]) => any, prop: string | symbol) {
  return function (this: any, ...args: any[]) {
    const memo = createMemoizedMethodForOneArg(method);
    (this as Record<string | symbol, unknown>)[prop] = memo;
    return memo.apply(this, args);
  };
}

/** `@memoize` — instance: per-instance cache (methods) / own property (getters); static: shared on class. */
export function memoize() {
  return function (target: object, prop: string | symbol, descriptor: PropertyDescriptor) {
    if (!descriptor || (typeof descriptor.get !== 'function' && typeof descriptor.value !== 'function')) {
      throw new TypeError('Only get accessors or class methods can be decorated via @memoize');
    }

    if (typeof target !== 'function') {
      /** Objects */
      typeof descriptor.get === 'function' && (descriptor.get = memoizeInstanceGetter(descriptor.get, prop));
      typeof descriptor.value === 'function' && (descriptor.value = memoizeInstanceMethod(descriptor.value, prop));
    } else {
      /** Static */
      typeof descriptor.get === 'function' && (descriptor.get = memoizeFn(descriptor.get));
      typeof descriptor.value === 'function' && (descriptor.value = createMemoizedMethodForOneArg(descriptor.value));
    }

    return descriptor;
  };
}

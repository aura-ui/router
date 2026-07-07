import { memoizeFn, type MemoHashFn, defaultArgsToHashFn } from '../misc/memoize';

/** `@memoize` — instance: per-instance cache (methods) / own property (getters); static: shared on class. */
export function memoize(hashFn: MemoHashFn = defaultArgsToHashFn) {
  return function(target: object, prop: string | symbol, descriptor: PropertyDescriptor) {
    if (!descriptor || (typeof descriptor.get !== 'function' && typeof descriptor.value !== 'function')) {
      throw new TypeError('Only get accessors or class methods can be decorated via @memoize');
    }

    if (typeof target !== 'function') {
      typeof descriptor.get === 'function' && (descriptor.get = memoizeInstanceGetter(descriptor.get, prop));
      typeof descriptor.value === 'function' && (descriptor.value = memoizeInstanceMethod(descriptor.value, prop, hashFn));
    } else {
      typeof descriptor.get === 'function' && (descriptor.get = memoizeFn(descriptor.get));
      typeof descriptor.value === 'function' && (descriptor.value = memoizeFn(descriptor.value, hashFn));
    }

    return descriptor;
  };
}

function memoizeInstanceGetter(getter: (this: any) => any, prop: string | symbol) {
  return function(this: any) {
    const value = getter.call(this);
    Object.defineProperty(this, prop, { value, writable: true, configurable: true });
    return value;
  };
}

function memoizeInstanceMethod(method: (...args: any[]) => any, prop: string | symbol, hashFn?: MemoHashFn) {
  return function(this: any, ...args: any[]) {
    const memo = memoizeFn(method, hashFn);
    (this as Record<string | symbol, unknown>)[prop] = memo;
    return memo.apply(this, args);
  };
}

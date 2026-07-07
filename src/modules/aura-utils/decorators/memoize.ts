import { memoizeFn, type MemoHashFn, defaultArgsToHashFn } from '../misc/memoize';
import { getPropertyDescriptor } from '../misc/utils';

/**
 * Method/getter decorator backed by {@link memoizeFn}.
 *
 * - **Static methods** — shared cache on the class; uses `hashFn`.
 * - **Static getters** — shared cache; always {@link defaultArgsToHashFn} (0 arguments).
 * - **Instance getters** — first read stores an own data property (no `hashFn`).
 * - **Instance methods** — first call installs a per-instance memoized wrapper; uses `hashFn`.
 *
 * Use {@link memoize.clear} and {@link memoize.has} to invalidate or probe the cache.
 *
 * @param hashFn - Builds the cache key from call arguments. Default {@link defaultArgsToHashFn}
 *   (0–1 primitive argument). For multiple arguments pass an explicit hash, e.g.
 *   `(pathname) => pathname` or `(pathname, pattern) => pathname + '\0' + pattern`.
 *
 * @example
 * ```ts
 * class Matcher {
 *   @memoize((pathname) => pathname)
 *   matchPath(pathname: string, nodes: readonly Node[]) { ... }
 *
 *   @memoize((pathname, pattern) => `${pathname}\0${pattern}`)
 *   getPathParams(pathname: string, pattern: string) { ... }
 * }
 *
 * memoize.clear(matcher, 'matchPath');
 * ```
 */
export function memoize(hashFn: MemoHashFn = defaultArgsToHashFn) {
  return function (target: object, prop: string | symbol, descriptor: PropertyDescriptor) {
    if (!descriptor || typeof (descriptor.value || descriptor.get) !== 'function') {
      throw new TypeError('@memoize can only be applied to getters and class methods');
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

/** Replaces an instance getter with a cached own property on first access. */
function memoizeInstanceGetter(getter: (this: any) => any, prop: string | symbol) {
  return function (this: any) {
    const value = getter.call(this);
    Object.defineProperty(this, prop, { value, writable: true, configurable: true });
    return value;
  };
}

/** Lazily replaces an instance method with a per-instance {@link memoizeFn} wrapper. */
function memoizeInstanceMethod(method: (...args: any[]) => any, prop: string | symbol, hashFn: MemoHashFn) {
  return function (this: any, ...args: any[]) {
    const memo = memoizeFn(method, hashFn);
    (this as Record<string | symbol, unknown>)[prop] = memo;
    return memo.apply(this, args);
  };
}

function clearMemo<T extends object>(target: T, property: keyof T | (keyof T)[]): void {
  if (Array.isArray(property)) return property.forEach((prop) => memoize.clear(target, prop));
  const desc = getPropertyDescriptor(target, property);
  if (!desc) return;
  if (typeof desc.get === 'function' && typeof (desc.get as any).clear === 'function') return (desc.get as any).clear();
  if (typeof desc.value === 'function' && typeof desc.value.clear === 'function') return desc.value.clear();
  if (Object.hasOwnProperty.call(target, property)) delete target[property];
}

/**
 * Clears memoization for a decorated static or instance member.
 *
 * - Static getter/method — calls `.clear()` on the memoized function.
 * - Materialized instance getter — deletes the own property.
 * - Instance method (after first call) — calls `.clear()` on the instance memo wrapper.
 * - Before the first instance method call — no-op (wrapper on the prototype has no cache yet).
 *
 * @param target - Class constructor (static member) or instance.
 * @param property - One member name, or an array of names.
 */
memoize.clear = clearMemo;

function hasMemo<T extends object>(target: T, property: keyof T, ...params: any[]): boolean {
  const desc = getPropertyDescriptor(target, property);
  if (!desc) return false;
  if (typeof desc.get === 'function' && typeof (desc.get as any).has === 'function') return (desc.get as any).has(...params);
  if (typeof desc.value === 'function' && typeof desc.value.has === 'function') return desc.value.has(...params);
  return Object.hasOwnProperty.call(target, property);
}

/**
 * Reports whether a decorated member has a cached entry.
 *
 * For memoized functions delegates to {@link MemoizedFn.has}.
 * For a materialized instance getter returns whether an own property exists.
 *
 * @param target - Class constructor (static member) or instance.
 * @param property - Member name.
 * @param params - Call arguments forwarded to the underlying `.has(...)` when available.
 */
memoize.has = hasMemo;

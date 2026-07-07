import { getPropertyDescriptor } from '../misc/utils';

/**
 * `@bind` decorator: lazily binds a class prototype method to its instance (`this`).
 *
 * @throws TypeError when applied to a non-method
 */
export function bind<Fn extends Function>(_target: object,
                                          methodName: string,
                                          descriptor: TypedPropertyDescriptor<Fn>): TypedPropertyDescriptor<Fn> {
  // Validation check
  if (!descriptor || (typeof descriptor.value !== 'function')) {
    throw new TypeError('Only class methods can be decorated via @bind');
  }
  // Original function
  const originalMethod = descriptor.value;

  return descriptor = {
    enumerable: descriptor.enumerable,
    configurable: true,

    get: function getBoundMethod(): Fn {
      const proto = Object.getPrototypeOf(this);
      const prototypeDescriptor = getPropertyDescriptor(proto, methodName);
      const isProtoCall = !prototypeDescriptor || prototypeDescriptor.get !== getBoundMethod;
      if (isProtoCall) return originalMethod;

      const boundFn = originalMethod.bind(this) as Fn;

      Object.defineProperty(this, methodName, {
        value: boundFn,
        writable: true,
        configurable: true,
        enumerable: descriptor.enumerable,
      });

      return boundFn;
    },

    set(value: Fn): void {
      Object.defineProperty(this, methodName, {
        value,
        writable: true,
        configurable: true,
        enumerable: descriptor.enumerable,
      });
    },
  };
}

import { memoize } from '../../decorators/memoize';

describe('@memoize decorator', () => {
  it('caches instance getter as own property', () => {
    const fn = jest.fn(() => 42);
    class Test {
      @memoize()
      get value() {
        return fn(this);
      }
    }

    const instance = new Test();
    expect(instance.value).toBe(42);
    expect(instance.value).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(Object.getOwnPropertyDescriptor(instance, 'value')?.value).toBe(42);
  });

  it('caches static getter', () => {
    const fn = jest.fn(() => 'static');
    class Test {
      @memoize()
      static get value() {
        return fn();
      }
    }

    expect(Test.value).toBe('static');
    expect(Test.value).toBe('static');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('caches instance method per instance', () => {
    const fn = jest.fn((n: number) => n * 2);
    class Test {
      @memoize()
      double(n: number) {
        return fn(n);
      }
    }

    const a = new Test();
    const b = new Test();
    expect(a.double(2)).toBe(4);
    expect(a.double(2)).toBe(4);
    expect(b.double(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('caches static method with custom hash by first argument', () => {
    const fn = jest.fn((pathname: string, suffix: string) => `${pathname}:${suffix}`);
    class Test {
      @memoize((pathname: string) => pathname)
      static join(pathname: string, suffix: string) {
        return fn(pathname, suffix);
      }
    }

    expect(Test.join('/a', '1')).toBe('/a:1');
    expect(Test.join('/a', '2')).toBe('/a:1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('memoize.clear resets static method cache', () => {
    const fn = jest.fn((n: number) => n + 1);
    class Test {
      @memoize()
      static inc(n: number) {
        return fn(n);
      }
    }

    expect(Test.inc(1)).toBe(2);
    memoize.clear(Test, 'inc');
    expect(Test.inc(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('memoize.clear resets instance method cache after first call', () => {
    const fn = jest.fn((n: number) => n + 1);
    class Test {
      @memoize()
      inc(n: number) {
        return fn(n);
      }
    }

    const instance = new Test();
    expect(instance.inc(1)).toBe(2);
    memoize.clear(instance, 'inc');
    expect(instance.inc(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('memoize.clear removes materialized instance getter property', () => {
    const fn = jest.fn(() => 99);
    class Test {
      @memoize()
      get value() {
        return fn();
      }
    }

    const instance = new Test();
    expect(instance.value).toBe(99);
    memoize.clear(instance, 'value');
    expect(Object.hasOwn(instance, 'value')).toBe(false);
    expect(instance.value).toBe(99);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('memoize.has reports cache state for static methods', () => {
    const fn = jest.fn((n: number) => n);
    class Test {
      @memoize()
      static id(n: number) {
        return fn(n);
      }
    }

    expect(memoize.has(Test, 'id', 5)).toBe(false);
    Test.id(5);
    expect(memoize.has(Test, 'id', 5)).toBe(true);
  });

  it('memoize.clear accepts an array of property names', () => {
    const a = jest.fn((n: number) => n);
    const b = jest.fn((n: number) => n * 10);
    class Test {
      @memoize()
      static first(n: number) {
        return a(n);
      }

      @memoize()
      static second(n: number) {
        return b(n);
      }
    }

    Test.first(1);
    Test.second(2);
    memoize.clear(Test, ['first', 'second']);
    Test.first(1);
    Test.second(2);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });
});

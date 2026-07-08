import { defaultArgsToHashFn, memoizeFn } from '../../misc/memoize';

describe('defaultArgsToHashFn', () => {
  it('returns null for zero arguments', () => {
    expect(defaultArgsToHashFn()).toBeNull();
  });

  it('returns the string as-is for a string argument', () => {
    expect(defaultArgsToHashFn('path')).toBe('path');
    expect(defaultArgsToHashFn('')).toBe('');
  });

  it('stringifies number and boolean arguments', () => {
    expect(defaultArgsToHashFn(1)).toBe('1');
    expect(defaultArgsToHashFn(false)).toBe('false');
  });

  it('returns undefined for more than one argument', () => {
    expect(defaultArgsToHashFn('a', 'b')).toBeUndefined();
  });

  it('returns undefined for non-primitive first argument', () => {
    expect(defaultArgsToHashFn({})).toBeUndefined();
    expect(defaultArgsToHashFn(null)).toBeUndefined();
  });
});

describe('memoizeFn', () => {
  it('caches unary primitive calls', () => {
    const fn = jest.fn((n: number) => n * 2);
    const memo = memoizeFn(fn);

    expect(memo(2)).toBe(4);
    expect(memo(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('caches zero-argument calls under null key', () => {
    const fn = jest.fn(() => 'ok');
    const memo = memoizeFn(fn);

    expect(memo()).toBe('ok');
    expect(memo()).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(memo.has()).toBe(true);
  });

  it('does not cache when default hash cannot be built', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fn = jest.fn((a: string, b: string) => a + b);
    const memo = memoizeFn(fn);

    expect(memo('a', 'b')).toBe('ab');
    expect(memo('a', 'b')).toBe('ab');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(memo.has('a', 'b')).toBe(false);

    warn.mockRestore();
  });

  it('caches multi-arg calls with a custom hash', () => {
    const fn = jest.fn((pathname: string, pattern: string) => `${pathname}:${pattern}`);
    const memo = memoizeFn(fn, (pathname, pattern) => `${pathname}\0${pattern}`);

    expect(memo('/u', '/:id')).toBe('/u:/:id');
    expect(memo('/u', '/:id')).toBe('/u:/:id');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(memo.has('/u', '/:id')).toBe(true);
  });

  it('caches undefined as a return value', () => {
    const fn = jest.fn(() => undefined);
    const memo = memoizeFn(fn);

    expect(memo('x')).toBeUndefined();
    expect(memo('x')).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('preserves this binding', () => {
    const obj = {
      value: 7,
      read(this: { value: number }) {
        return this.value;
      },
    };
    const memo = memoizeFn(obj.read);
    expect(memo.call(obj)).toBe(7);
    expect(memo.call(obj)).toBe(7);
  });

  it('exposes cache, clear, and has', () => {
    const memo = memoizeFn((x: string) => x.length);
    memo('ab');
    expect(memo.cache.size).toBe(1);
    expect(memo.has('ab')).toBe(true);
    memo.clear();
    expect(memo.cache.size).toBe(0);
    expect(memo.has('ab')).toBe(false);
  });
});

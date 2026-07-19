import { isThenable } from '../../async/is-thenable';

describe('isThenable', () => {
  it('returns true for Promise', () => {
    expect(isThenable(Promise.resolve(1))).toBe(true);
  });

  it('returns true for Promise-like thenables', () => {
    const thenable = { then: () => undefined };
    expect(isThenable(thenable)).toBe(true);
  });

  it('returns false for plain values', () => {
    expect(isThenable(null)).toBe(false);
    expect(isThenable(undefined)).toBe(false);
    expect(isThenable(0)).toBe(false);
    expect(isThenable('ok')).toBe(false);
    expect(isThenable({ then: 1 })).toBe(false);
    expect(isThenable({})).toBe(false);
  });
});

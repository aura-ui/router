import { parseNullableString, parseNumber } from '../../misc/format';

describe('parseNullableString', () => {
  it('returns null when attribute is absent', () => {
    expect(parseNullableString(null)).toBeNull();
  });

  it('returns empty string for explicit opt-out', () => {
    expect(parseNullableString('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(parseNullableString('  #main  ')).toBe('#main');
  });

  it('preserves selector syntax', () => {
    expect(parseNullableString('article.post > .content')).toBe('article.post > .content');
  });
});

describe('parseNumber', () => {
  it('returns null when attribute is absent or empty', () => {
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber('')).toBeNull();
  });

  it('parses finite ms values', () => {
    expect(parseNumber('0')).toBe(0);
    expect(parseNumber('60000')).toBe(60_000);
  });

  it('parses Infinity', () => {
    expect(parseNumber('Infinity')).toBe(Infinity);
  });

  it('returns null for non-numeric input', () => {
    expect(parseNumber('abc')).toBeNull();
  });
});

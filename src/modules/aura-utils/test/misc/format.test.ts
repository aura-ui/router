import { parseNullableString } from '../../misc/format';

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

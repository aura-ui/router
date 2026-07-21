import {
  parseHookList,
  parseInheritableNullableString,
} from '../../core/attr/inherit-attr-parser';
import { isOffKeyword } from '../../core/attr/off-keyword';

describe('isOffKeyword', () => {
  it('matches none, off, false', () => {
    expect(isOffKeyword('none')).toBe(true);
    expect(isOffKeyword('OFF')).toBe(true);
    expect(isOffKeyword(' false ')).toBe(true);
    expect(isOffKeyword('auth')).toBe(false);
  });
});

describe('parseHookList', () => {
  it('returns null when absent, [] when off, hooks otherwise', () => {
    expect(parseHookList(null)).toBeNull();
    expect(parseHookList('none')).toEqual([]);
    expect(parseHookList('auth,log')).toEqual(['auth', 'log']);
  });
});

describe('parseInheritableNullableString', () => {
  it('returns null when absent, off, or empty', () => {
    expect(parseInheritableNullableString(null)).toBeNull();
    expect(parseInheritableNullableString('none')).toBeNull();
    expect(parseInheritableNullableString('off')).toBeNull();
    expect(parseInheritableNullableString('false')).toBeNull();
    expect(parseInheritableNullableString('   ')).toBeNull();
  });

  it('returns trimmed value when set', () => {
    expect(parseInheritableNullableString('#main')).toBe('#main');
    expect(parseInheritableNullableString('loading')).toBe('loading');
  });
});

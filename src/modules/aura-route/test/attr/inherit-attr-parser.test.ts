import {
  parseHookList,
  parseOffableString,
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

describe('parseOffableString', () => {
  it('returns null when absent, off, or empty', () => {
    expect(parseOffableString(null)).toBeNull();
    expect(parseOffableString('none')).toBeNull();
    expect(parseOffableString('off')).toBeNull();
    expect(parseOffableString('false')).toBeNull();
    expect(parseOffableString('   ')).toBeNull();
  });

  it('returns trimmed value when set', () => {
    expect(parseOffableString('#main')).toBe('#main');
    expect(parseOffableString('loading')).toBe('loading');
  });
});

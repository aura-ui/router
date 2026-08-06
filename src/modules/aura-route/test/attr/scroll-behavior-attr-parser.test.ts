import { parseScrollBehaviorAttr } from '../../core/attr/scroll-behavior-attr-parser';

describe('parseScrollBehaviorAttr', () => {
  it('parses smooth, instant, auto', () => {
    expect(parseScrollBehaviorAttr('smooth')).toBe('smooth');
    expect(parseScrollBehaviorAttr('instant')).toBe('instant');
    expect(parseScrollBehaviorAttr('auto')).toBe('auto');
  });

  it('trims and lowercases', () => {
    expect(parseScrollBehaviorAttr('  SMOOTH  ')).toBe('smooth');
    expect(parseScrollBehaviorAttr(' Instant')).toBe('instant');
  });

  it('defaults to auto when absent or empty', () => {
    expect(parseScrollBehaviorAttr(null)).toBe('auto');
    expect(parseScrollBehaviorAttr('')).toBe('auto');
    expect(parseScrollBehaviorAttr('   ')).toBe('auto');
  });

  it('returns null for unknown values', () => {
    expect(parseScrollBehaviorAttr('slow')).toBeNull();
    expect(parseScrollBehaviorAttr('true')).toBeNull();
    expect(parseScrollBehaviorAttr('none')).toBeNull();
  });
});

import { parseScrollAttr } from '../../core/attr/scroll-attr-parser';

describe('parseScrollAttr', () => {
  it('parses known scroll modes', () => {
    expect(parseScrollAttr('restore')).toBe('restore');
    expect(parseScrollAttr('top')).toBe('top');
  });

  it('normalizes case and whitespace', () => {
    expect(parseScrollAttr('  RESTORE  ')).toBe('restore');
    expect(parseScrollAttr(' Top')).toBe('top');
  });

  it('treats inherit opt-out keywords as manual', () => {
    expect(parseScrollAttr('none')).toBe('manual');
    expect(parseScrollAttr('off')).toBe('manual');
    expect(parseScrollAttr('false')).toBe('manual');
  });

  it('returns null for empty or invalid values', () => {
    expect(parseScrollAttr('')).toBeNull();
    expect(parseScrollAttr('   ')).toBeNull();
    expect(parseScrollAttr(null)).toBeNull();
    expect(parseScrollAttr('manual')).toBeNull();
    expect(parseScrollAttr('unknown')).toBeNull();
  });
});

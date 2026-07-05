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

  it('treats empty string as manual opt-out', () => {
    expect(parseScrollAttr('')).toBe('manual');
    expect(parseScrollAttr('   ')).toBe('manual');
  });

  it('returns null when attr is absent or invalid', () => {
    expect(parseScrollAttr(null)).toBeNull();
    expect(parseScrollAttr('manual')).toBeNull();
    expect(parseScrollAttr('unknown')).toBeNull();
  });
});

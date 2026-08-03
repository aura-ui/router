import { parseScrollAttr } from '../../core/attr/scroll-attr-parser';

describe('parseScrollAttr', () => {
  it('parses known scroll modes', () => {
    expect(parseScrollAttr('auto')).toBe('auto');
    expect(parseScrollAttr('top')).toBe('top');
  });

  it('normalizes case and whitespace', () => {
    expect(parseScrollAttr('  AUTO  ')).toBe('auto');
    expect(parseScrollAttr(' Top')).toBe('top');
  });

  it('treats inherit opt-out keywords as none', () => {
    expect(parseScrollAttr('none')).toBe('none');
    expect(parseScrollAttr('off')).toBe('none');
    expect(parseScrollAttr('false')).toBe('none');
  });

  it('defaults to auto when absent or empty', () => {
    expect(parseScrollAttr(null)).toBe('auto');
    expect(parseScrollAttr('')).toBe('auto');
    expect(parseScrollAttr('   ')).toBe('auto');
  });

  it('returns null for invalid values', () => {
    expect(parseScrollAttr('restore')).toBeNull();
    expect(parseScrollAttr('manual')).toBeNull();
    expect(parseScrollAttr('unknown')).toBeNull();
  });
});

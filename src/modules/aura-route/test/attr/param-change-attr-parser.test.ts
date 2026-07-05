import { parseParamChangeAttr } from '../../core/attr/param-change-attr-parser';

describe('parseParamChangeAttr', () => {
  it('returns null when attr is absent or inference', () => {
    expect(parseParamChangeAttr(null)).toBeNull();
    expect(parseParamChangeAttr('')).toBeNull();
    expect(parseParamChangeAttr('auto')).toBeNull();
  });

  it('parses explicit overrides', () => {
    expect(parseParamChangeAttr('update')).toBe('update');
    expect(parseParamChangeAttr('navigate')).toBe('navigate');
    expect(parseParamChangeAttr('NAVIGATE')).toBe('navigate');
  });

  it('returns null for unknown values', () => {
    expect(parseParamChangeAttr('full')).toBeNull();
  });
});

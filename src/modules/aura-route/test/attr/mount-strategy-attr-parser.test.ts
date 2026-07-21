import { parseMountStrategyAttr } from '../../core/attr/mount-strategy-attr-parser';

describe('parseMountStrategyAttr', () => {
  it('returns branch when attr is absent', () => {
    expect(parseMountStrategyAttr(null)).toBe('branch');
  });

  it('returns branch for empty, off, unknown, or explicit branch', () => {
    expect(parseMountStrategyAttr('')).toBe('branch');
    expect(parseMountStrategyAttr('   ')).toBe('branch');
    expect(parseMountStrategyAttr('off')).toBe('branch');
    expect(parseMountStrategyAttr('eager')).toBe('branch');
    expect(parseMountStrategyAttr('per-route')).toBe('branch');
    expect(parseMountStrategyAttr('BRANCH')).toBe('branch');
  });

  it('parses full', () => {
    expect(parseMountStrategyAttr(' full ')).toBe('full');
  });
});

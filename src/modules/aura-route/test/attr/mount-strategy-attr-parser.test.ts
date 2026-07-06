import {
  DEFAULT_ROUTER_MOUNT_STRATEGY,
  parseMountStrategyAttr,
} from '../../core/attr/mount-strategy-attr-parser';

describe('parseMountStrategyAttr', () => {
  it('returns null when attr is absent', () => {
    expect(parseMountStrategyAttr(null)).toBeNull();
  });

  it('returns null for empty or unknown values', () => {
    expect(parseMountStrategyAttr('')).toBeNull();
    expect(parseMountStrategyAttr('   ')).toBeNull();
    expect(parseMountStrategyAttr('eager')).toBeNull();
  });

  it('parses known mount strategies', () => {
    expect(parseMountStrategyAttr('per-route')).toBe('per-route');
    expect(parseMountStrategyAttr('BRANCH')).toBe('branch');
    expect(parseMountStrategyAttr(' full ')).toBe('full');
  });

  it('exposes recommended router default', () => {
    expect(DEFAULT_ROUTER_MOUNT_STRATEGY).toBe('branch');
  });
});

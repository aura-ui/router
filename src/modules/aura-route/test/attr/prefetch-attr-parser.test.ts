import {
  DEFAULT_ROUTER_PREFETCH_MODE,
  parsePrefetchAttr,
} from '../../core/attr/prefetch-attr-parser';

describe('parsePrefetchAttr', () => {
  it('returns null when attr is absent', () => {
    expect(parsePrefetchAttr(null)).toBeNull();
  });

  it('returns false for empty or disabled values', () => {
    expect(parsePrefetchAttr('')).toBe(false);
    expect(parsePrefetchAttr('   ')).toBe(false);
    expect(parsePrefetchAttr('false')).toBe(false);
    expect(parsePrefetchAttr('none')).toBe(false);
    expect(parsePrefetchAttr('off')).toBe(false);
  });

  it('maps true to default router mode', () => {
    expect(parsePrefetchAttr('true')).toBe(DEFAULT_ROUTER_PREFETCH_MODE);
  });

  it('parses known prefetch modes', () => {
    expect(parsePrefetchAttr('intent')).toBe('intent');
    expect(parsePrefetchAttr('VIEWPORT')).toBe('viewport');
    expect(parsePrefetchAttr(' tap ')).toBe('tap');
    expect(parsePrefetchAttr('render')).toBe('render');
    expect(parsePrefetchAttr('manual')).toBe('manual');
  });

  it('returns null for unknown values', () => {
    expect(parsePrefetchAttr('hover')).toBeNull();
  });
});

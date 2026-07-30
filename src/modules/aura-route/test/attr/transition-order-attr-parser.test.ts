import { parseTransitionOrder } from '../../core/attr/transition-order-attr-parser';

describe('parseTransitionOrder', () => {
  it('returns null for unset or invalid', () => {
    expect(parseTransitionOrder(null)).toBeNull();
    expect(parseTransitionOrder('')).toBeNull();
    expect(parseTransitionOrder('foo')).toBeNull();
  });

  it('parses valid policies', () => {
    expect(parseTransitionOrder('parallel')).toBe('parallel');
    expect(parseTransitionOrder('out-in')).toBe('out-in');
  });
});

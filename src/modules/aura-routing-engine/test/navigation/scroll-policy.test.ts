import {
  DEFAULT_SCROLL_POLICY,
  parseScrollPolicy,
  resolveRouteScrollPolicy,
  resolveScrollPolicy,
} from '../../core/navigation/scroll-policy';

describe('parseScrollPolicy', () => {
  it('parses known policies', () => {
    expect(parseScrollPolicy('restore')).toBe('restore');
    expect(parseScrollPolicy('top')).toBe('top');
    expect(parseScrollPolicy('manual')).toBe('manual');
  });

  it('treats empty string as manual opt-out', () => {
    expect(parseScrollPolicy('')).toBe('manual');
  });

  it('returns null when unset or unknown', () => {
    expect(parseScrollPolicy(null)).toBeNull();
    expect(parseScrollPolicy('unknown')).toBeNull();
  });
});

describe('resolveScrollPolicy', () => {
  it('falls back to manual', () => {
    expect(resolveScrollPolicy(null)).toBe(DEFAULT_SCROLL_POLICY);
    expect(resolveScrollPolicy(undefined)).toBe(DEFAULT_SCROLL_POLICY);
    expect(resolveScrollPolicy('restore')).toBe('restore');
  });
});

describe('resolveRouteScrollPolicy', () => {
  it('reads scroll from route-like source', () => {
    expect(resolveRouteScrollPolicy({ scrollPolicy: 'top' })).toBe('top');
    expect(resolveRouteScrollPolicy({ scrollPolicy: null })).toBe('manual');
    expect(resolveRouteScrollPolicy({})).toBe('manual');
  });
});

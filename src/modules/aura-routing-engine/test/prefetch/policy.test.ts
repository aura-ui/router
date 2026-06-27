import {
  isHashOnlyNavigation,
  normalizePrefetchHref,
  shouldSkipPrefetch,
} from '../../core/prefetch/policy';

describe('prefetch policy', () => {
  it('normalizePrefetchHref rejects external and hash-only links', () => {
    expect(normalizePrefetchHref('/users')).toBe('/users');
    expect(normalizePrefetchHref('https://example.com/x')).toBeNull();
    expect(normalizePrefetchHref('#section')).toBeNull();
  });

  it('isHashOnlyNavigation matches prefetch semantics', () => {
    expect(isHashOnlyNavigation('/page#b', '/page#a')).toBe(true);
    expect(isHashOnlyNavigation('/page#tab', '/page')).toBe(false);
    expect(isHashOnlyNavigation('/page', '/page#tab')).toBe(false);
    expect(isHashOnlyNavigation('/page#section', '/page')).toBe(false);
    expect(isHashOnlyNavigation('/page?q=1#tab', '/page?q=1#old')).toBe(true);
  });

  it('shouldSkipPrefetch respects staleTime', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    expect(
      shouldSkipPrefetch({
        href: '/users',
        mode: 'intent',
        config: {},
        lastPrefetchAt: now - 1_000,
      }),
    ).toBe('same-route-fresh');

    expect(
      shouldSkipPrefetch({
        href: '/users',
        mode: 'intent',
        config: {},
        lastPrefetchAt: now - 60_000,
      }),
    ).toBeNull();

    jest.restoreAllMocks();
  });
});

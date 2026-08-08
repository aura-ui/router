import { PrefetchPolicy } from '../../core/prefetch/policy';

describe('prefetch policy', () => {
  const policy = new PrefetchPolicy();

  it('normalizeHref accepts same-origin absolute and rejects external / hash-only', () => {
    expect(policy.normalizeHref('/users')).toBe('/users');
    expect(policy.normalizeHref(`${window.location.origin}/users`)).toBe('/users');
    expect(policy.normalizeHref(`${window.location.origin}/`)).toBe('/');
    expect(policy.normalizeHref(`//${window.location.host}/users`)).toBe('/users');
    expect(policy.normalizeHref('https://example.com/x')).toBeNull();
    expect(policy.normalizeHref('//example.com/x')).toBeNull();
    expect(policy.normalizeHref('#section')).toBeNull();
  });

  it('skipReason treats hash-only prefetch as skip', () => {
    const configured = new PrefetchPolicy({ currentHref: () => '/page#old' });

    expect(configured.skipReason({ href: '/page#new', mode: 'intent' })).toBe('hash-only');
    expect(configured.skipReason({ href: '/page#tab', mode: 'intent' })).toBe('hash-only');
    expect(configured.skipReason({ href: '/page', mode: 'intent' })).toBeNull();
    expect(
      new PrefetchPolicy({ currentHref: () => '/page' }).skipReason({
        href: '/page#tab',
        mode: 'intent',
      }),
    ).toBeNull();
  });

  it('shouldSkipPrefetch respects staleTime', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    expect(
      policy.skipReason({
        href: '/users',
        mode: 'intent',
        lastPrefetchAt: now - 1_000,
      }),
    ).toBe('same-route-fresh');

    expect(
      policy.skipReason({
        href: '/users',
        mode: 'intent',
        lastPrefetchAt: now - 60_000,
      }),
    ).toBeNull();

    jest.restoreAllMocks();
  });

  it('delayFor maps modes to configured delays', () => {
    const configured = new PrefetchPolicy({
      intentDelayMs: 80,
      viewportDelayMs: 10,
      tapDelayMs: 5,
    });

    expect(configured.delayFor('intent')).toBe(80);
    expect(configured.delayFor('viewport')).toBe(10);
    expect(configured.delayFor('tap')).toBe(5);
    expect(configured.delayFor('manual')).toBe(0);
    expect(configured.delayFor('none')).toBe(0);
  });

  it('confidenceFor maps modes to tiers', () => {
    expect(policy.confidenceFor('none')).toBe(0);
    expect(policy.confidenceFor('intent')).toBe(0.3);
    expect(policy.confidenceFor('viewport')).toBe(0.5);
    expect(policy.confidenceFor('tap')).toBe(0.85);
    expect(policy.confidenceFor('render')).toBe(0.9);
    expect(policy.confidenceFor('manual')).toBe(1);
  });

  it('skipReason handles disabled mode, force, and hash-only current href', () => {
    const configured = new PrefetchPolicy({ currentHref: () => '/page#old' });

    expect(configured.skipReason({ href: '/users', mode: 'none' })).toBe('disabled');
    expect(
      configured.skipReason({
        href: '/users',
        mode: 'intent',
        lastPrefetchAt: Date.now(),
        force: true,
      }),
    ).toBeNull();
    expect(configured.skipReason({ href: '/page#new', mode: 'intent' })).toBe('hash-only');
  });

  it('shouldPrefetchView and shouldPrefetchData follow confidence gates', () => {
    expect(policy.shouldPrefetchView({ mode: 'intent', confidence: 0.3 })).toBe(false);
    expect(policy.shouldPrefetchView({ mode: 'tap', confidence: 0.85 })).toBe(true);
    expect(policy.shouldPrefetchView({ mode: 'manual', confidence: 1 })).toBe(true);

    expect(policy.shouldPrefetchData({ mode: 'intent', confidence: 0.3 })).toBe(true);
    expect(policy.shouldPrefetchData({ mode: 'none', confidence: 0 })).toBe(false);
  });

  it('skipReason respects save-data connection preference', () => {
    const connection = { saveData: true };
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: connection,
    });

    expect(policy.skipReason({ href: '/users', mode: 'intent' })).toBe('save-data');

    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: undefined,
    });
  });

  it('normalizeHref rejects empty path segments', () => {
    expect(policy.normalizeHref('   ')).toBeNull();
  });
});

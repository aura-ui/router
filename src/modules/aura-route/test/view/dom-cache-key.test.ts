import { domCacheKey } from '../../core/view/dom-cache';

describe('domCacheKey', () => {
  it('uses pathname from matcher input', () => {
    expect(
      domCacheKey({ pathname: '/user/1', href: '/user/1', pattern: '/user/:id' } as any, 'user/:id'),
    ).toBe('/user/1');
  });

  it('uses pathname on lifecycle input', () => {
    expect(domCacheKey({ pathname: '/user/1' }, '/fallback')).toBe('/user/1');
  });

  it('falls back to route attr and serializes query', () => {
    expect(domCacheKey({ pathname: '/search', query: { q: 'a', page: '2' } } as any, '/fallback')).toBe(
      '/search|page=2&q=a',
    );
    expect(domCacheKey(undefined, 'user/:id')).toBe('user/:id');
  });

  it('matches matcher and lifecycle keys for the same URL', () => {
    const fromMatcher = domCacheKey({ pathname: '/user/1' } as any, 'user/:id');
    const fromLifecycle = domCacheKey({ pathname: '/user/1' }, 'user/:id');

    expect(fromLifecycle).toBe(fromMatcher);
    expect(fromMatcher).toBe('/user/1');
  });

  it('escapes delimiter characters in query values', () => {
    expect(domCacheKey({ pathname: '/x', query: { q: 'a|b=c&d' } } as any, '/fallback')).toBe(
      '/x|q=a%7Cb%3Dc%26d',
    );
  });
});

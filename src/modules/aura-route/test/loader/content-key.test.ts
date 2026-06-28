import { contentCacheKey } from '../../../aura-routing-engine/core';

describe('contentCacheKey', () => {
  const desc = { kind: 'content' as const, loader: 'html-src', ref: 'pages/home.html', cache: true };

  it('includes loader and ref', () => {
    expect(
      contentCacheKey(desc, { pathname: '/home', pattern: '/home' } as any),
    ).toBe('/home|html-src:pages/home.html');
  });

  it('serializes query', () => {
    expect(
      contentCacheKey(
        desc,
        { pathname: '/search', query: { q: 'a', page: '2' }, pattern: '/search' } as any,
      ),
    ).toBe('/search|page=2&q=a|html-src:pages/home.html');
  });

  it('falls back to pattern when pathname is absent', () => {
    expect(contentCacheKey(desc, { pattern: '/user/:id' } as any)).toBe(
      '/user/:id|html-src:pages/home.html',
    );
  });
});

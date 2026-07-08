import { dataCacheKey } from '../../core/content/cache/data-key';

describe('dataCacheKey', () => {
  const desc = { kind: 'content' as const, loader: 'url', ref: 'pages/home.html', cache: true };

  it('includes loader and ref', () => {
    expect(
      dataCacheKey(desc, { pathname: '/home', pattern: '/home' } as any),
    ).toBe('/home|url:pages/home.html');
  });

  it('serializes query', () => {
    expect(
      dataCacheKey(
        desc,
        { pathname: '/search', query: { q: 'a', page: '2' }, pattern: '/search' } as any,
      ),
    ).toBe('/search|page=2&q=a|url:pages/home.html');
  });

  it('falls back to pattern when pathname is absent', () => {
    expect(dataCacheKey(desc, { pattern: '/user/:id' } as any)).toBe(
      '/user/:id|url:pages/home.html',
    );
  });

  it('uses resolved ref in descriptor for per-id cache keys', () => {
    expect(
      dataCacheKey(
        { kind: 'content', loader: 'url', ref: 'pages/user/1.html', cache: true },
        { pathname: '/user/1', pattern: '/user/:id', params: { id: '1' } } as any,
      ),
    ).toBe('/user/1|url:pages/user/1.html');

    expect(
      dataCacheKey(
        { kind: 'content', loader: 'url', ref: 'pages/user/2.html', cache: true },
        { pathname: '/user/2', pattern: '/user/:id', params: { id: '2' } } as any,
      ),
    ).toBe('/user/2|url:pages/user/2.html');
  });

  it('separates cache slots for same ref on different pathnames', () => {
    const descriptor = {
      kind: 'content' as const,
      loader: 'url',
      ref: 'partials/user-shell.html',
      cache: true,
    };

    expect(
      dataCacheKey(descriptor, { pathname: '/user/1', pattern: '/user/:id' } as any),
    ).not.toBe(
      dataCacheKey(descriptor, { pathname: '/user/2', pattern: '/user/:id' } as any),
    );
  });
});

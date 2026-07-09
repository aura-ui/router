import { payloadCacheKey } from '../../core/view-graph';

describe('payloadCacheKey', () => {
  const desc = { kind: 'content' as const, loader: 'html' as const, ref: 'static', cache: true };

  it('uses pathname when present', () => {
    expect(
      payloadCacheKey(desc, { pathname: '/home', pattern: '/home' } as any),
    ).toBe('/home|html:static');
  });

  it('falls back to pattern when pathname is missing', () => {
    expect(
      payloadCacheKey(
        { ...desc, loader: 'url', ref: 'pages/about.html' },
        { pattern: '/about' } as any,
      ),
    ).toBe('/about|url:pages/about.html');
  });

  it('uses pattern-only route keys', () => {
    expect(payloadCacheKey(desc, { pattern: '/user/:id' } as any)).toBe(
      '/user/:id|html:static',
    );
  });

  it('includes loader ref in key', () => {
    expect(
      payloadCacheKey(
        { kind: 'content', loader: 'template', ref: 'tpl-id', cache: true },
        { pathname: '/page', pattern: '/page' } as any,
      ),
    ).toBe('/page|template:tpl-id');
  });

  it('differentiates params via pathname', () => {
    const descriptor = {
      kind: 'content' as const,
      loader: 'html' as const,
      ref: 'static',
      cache: true,
    };

    expect(
      payloadCacheKey(descriptor, { pathname: '/user/1', pattern: '/user/:id' } as any),
    ).not.toBe(
      payloadCacheKey(descriptor, { pathname: '/user/2', pattern: '/user/:id' } as any),
    );
  });

  it('appends extract suffix when present', () => {
    const base = { pathname: '/about', pattern: '/about' };
    const partial = {
      kind: 'content' as const,
      loader: 'url' as const,
      ref: 'legacy/about.html',
      cache: true,
    };
    const full = { ...partial, extract: '#main' };

    expect(payloadCacheKey(partial, base as any)).toBe('/about|url:legacy/about.html');
    expect(payloadCacheKey(full, base as any)).toBe('/about|url:legacy/about.html::#main');
    expect(payloadCacheKey(partial, base as any)).not.toBe(payloadCacheKey(full, base as any));
  });

  it('differentiates params when pathname is missing', () => {
    const descriptor = {
      kind: 'content' as const,
      loader: 'html' as const,
      ref: 'static',
      cache: true,
    };

    expect(
      payloadCacheKey(descriptor, { pattern: '/user/:id', params: { id: '1' } } as any),
    ).not.toBe(
      payloadCacheKey(descriptor, { pattern: '/user/:id', params: { id: '2' } } as any),
    );
  });

  it('differentiates load-hook data in cache key', () => {
    const descriptor = {
      kind: 'content' as const,
      loader: 'component' as const,
      ref: 'my-widget',
      cache: true,
    };
    const route = { pathname: '/page', pattern: '/page' } as any;

    expect(payloadCacheKey(descriptor, route, { data: { id: 1 } })).not.toBe(
      payloadCacheKey(descriptor, route, { data: { id: 2 } }),
    );
  });

  it('omits data segment when data is undefined', () => {
    const descriptor = {
      kind: 'content' as const,
      loader: 'html' as const,
      ref: 'static',
      cache: true,
    };
    const route = { pathname: '/page', pattern: '/page' } as any;

    expect(payloadCacheKey(descriptor, route)).toBe(
      payloadCacheKey(descriptor, route, {}),
    );
  });
});

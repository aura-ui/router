import { payloadCacheKey } from '../../../core/view-graph/cache/cache-key';
import type { MatchedRouteInfo } from '../../../core/match/url-matcher';
import type { ViewDescriptor } from '../../../core/view-graph/types';

function route(overrides: Partial<MatchedRouteInfo> = {}): MatchedRouteInfo {
  return {
    href: '/users/1',
    pathname: '/users/1',
    search: '',
    hash: '',
    pattern: '/users/:id',
    params: { id: '1' },
    route: { layout: '', view: null, preserve: { view: true } },
    ...overrides,
  } as MatchedRouteInfo;
}

function descriptor(overrides: Partial<ViewDescriptor> = {}): ViewDescriptor {
  return {
    kind: 'view',
    loader: 'url',
    content: 'partials/user.html',
    cache: true,
    ...overrides,
  };
}

describe('payloadCacheKey', () => {
  it('uses pathname and view slot', () => {
    const key = payloadCacheKey(descriptor(), route());
    expect(key).toBe('/users/1|view:url:partials/user.html');
  });

  it('includes sorted query params', () => {
    const key = payloadCacheKey(
      descriptor(),
      route({ query: { b: '2', a: '1' } }),
    );
    expect(key).toBe('/users/1|a=1&b=2|view:url:partials/user.html');
  });

  it('includes serialized load-hook data with stable key ordering', () => {
    const key = payloadCacheKey(descriptor(), route(), { data: { z: 1, a: 2 } });
    expect(key).toBe(
      '/users/1|d:%7B%22a%22%3A2%2C%22z%22%3A1%7D|view:url:partials/user.html',
    );
  });

  it('appends extract selector for url views', () => {
    const key = payloadCacheKey(
      descriptor({ extract: '#content' }),
      route(),
    );
    expect(key).toBe('/users/1|view:url:partials/user.html::#content');
  });

  it('uses matchKey and params when pathname is missing', () => {
    const key = payloadCacheKey(
      descriptor({ loader: 'html', content: '<p/>' }),
      route({
        pathname: undefined as unknown as string,
        pattern: '/settings',
        params: { tab: 'profile' },
      }),
    );
    expect(key).toBe('/settings|tab=profile|view:html:<p/>');
  });

  it('uses matchKey without params when pathname is missing', () => {
    const key = payloadCacheKey(
      descriptor({ loader: 'html', content: '<p/>' }),
      route({
        pathname: undefined as unknown as string,
        pattern: '/settings',
        params: undefined,
      }),
    );
    expect(key).toBe('/settings|view:html:<p/>');
  });

  it('skips null param values in query encoding', () => {
    const key = payloadCacheKey(
      descriptor(),
      route({ query: { a: '1', b: null as unknown as string } }),
    );
    expect(key).toBe('/users/1|a=1|view:url:partials/user.html');
  });

  it('omits empty params segment when all values are null', () => {
    const key = payloadCacheKey(
      descriptor({ loader: 'html', content: '<p/>' }),
      route({
        pathname: undefined as unknown as string,
        pattern: '/settings',
        params: { tab: null as unknown as string },
      }),
    );
    expect(key).toBe('/settings|view:html:<p/>');
  });

  it('omits params segment for an empty params object', () => {
    const key = payloadCacheKey(
      descriptor({ loader: 'html', content: '<p/>' }),
      route({
        pathname: undefined as unknown as string,
        pattern: '/settings',
        params: {},
      }),
    );
    expect(key).toBe('/settings|view:html:<p/>');
  });

  it('includes layout kind in the slot', () => {
    const key = payloadCacheKey(
      descriptor({ kind: 'layout', loader: 'template', content: 'shell' }),
      route({ pathname: '/app' }),
    );
    expect(key).toBe('/app|layout:template:shell');
  });
});

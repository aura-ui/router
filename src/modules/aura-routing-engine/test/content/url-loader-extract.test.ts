import { UrlLoader } from '../../core/view-graph/loaders/url';
import type { ViewLoadContext } from '../../core/view-graph';

const FULL_PAGE = `<!DOCTYPE html><html><body><main id="main"><p>Fragment</p></main></body></html>`;

function urlLoader() {
  return new UrlLoader({
    fetchText: async () => FULL_PAGE,
    resolveUrl: (path) => path,
    isSSR: false,
  });
}

function loadCtx(extract?: string): ViewLoadContext {
  return {
    ref: 'legacy/about.html',
    kind: 'content',
    extract,
    signal: new AbortController().signal,
    route: { href: '/about', pattern: '/about' },
  };
}

describe('UrlLoader extract', () => {
  it('returns full response when extract is omitted', async () => {
    const result = await urlLoader().load(loadCtx());

    expect(result).toEqual({
      kind: 'html',
      html: expect.stringContaining('<main id="main">'),
    });
    expect(result?.kind === 'html' ? result.html : '').toContain('<html>');
  });

  it('returns fragment when extract selector is set', async () => {
    const result = await urlLoader().load(loadCtx('#main'));

    expect(result).toEqual({ kind: 'html', html: '<p>Fragment</p>' });
  });
});

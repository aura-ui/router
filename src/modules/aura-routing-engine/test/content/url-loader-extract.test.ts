import { UrlLoader, toViewPayload } from '../../core/content-graph';
import type { LoadContext } from '../../core/content-graph';

const FULL_PAGE = `<!DOCTYPE html><html><body><main id="main"><p>Fragment</p></main></body></html>`;

function urlLoader() {
  return new UrlLoader({
    fetchText: async () => FULL_PAGE,
    resolveUrl: (path) => path,
    isSSR: false,
  });
}

function loadCtx(extract?: string): LoadContext {
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
    const html = toViewPayload(result);

    expect(html).toContain('<main id="main">');
    expect(html).toContain('<html>');
  });

  it('returns fragment when extract selector is set', async () => {
    const result = await urlLoader().load(loadCtx('#main'));
    const fragment = toViewPayload(result);

    expect(fragment).toBe('<p>Fragment</p>');
  });
});

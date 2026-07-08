import { createBuiltinLoaders } from '../../core/content';

const FULL_PAGE = `<!DOCTYPE html><html><body><main id="main"><p>Fragment</p></main></body></html>`;

function urlLoader() {
  const entries = createBuiltinLoaders({
    fetchText: async () => FULL_PAGE,
    resolveUrl: (path) => path,
  });
  return entries.find((entry) => entry.type === 'url')!.load;
}

describe('url loader extract', () => {
  const signal = new AbortController().signal;

  it('returns full response when extract is omitted', async () => {
    const html = await urlLoader()({
      ref: 'legacy/about.html',
      route: { href: '/about', pattern: '/about' },
      signal,
    });

    expect(html).toContain('<main id="main">');
    expect(html).toContain('<html>');
  });

  it('returns fragment when extract selector is set', async () => {
    const fragment = await urlLoader()({
      ref: 'legacy/about.html',
      extract: '#main',
      route: { href: '/about', pattern: '/about' },
      signal,
    });

    expect(fragment).toBe('<p>Fragment</p>');
  });
});

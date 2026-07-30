import {
  createBrowserEnvironment,
  fetchText,
  resolveRelativeUrl,
} from '../../core/view-graph/environment';

describe('resolveRelativeUrl', () => {
  const page = 'https://site.com/events/2025/';

  it('resolves relative paths from origin, not the current route', () => {
    expect(resolveRelativeUrl('pages/foo.html', page)).toBe('https://site.com/pages/foo.html');
    expect(resolveRelativeUrl('/pages/foo.html', page)).toBe('https://site.com/pages/foo.html');
    expect(resolveRelativeUrl('./detail', page)).toBe('https://site.com/detail');
  });

  it('passes absolute http(s) URLs through unchanged', () => {
    expect(resolveRelativeUrl('https://yandex.by', page)).toBe('https://yandex.by/');
    expect(resolveRelativeUrl('http://cdn.example.com/partial.html', page)).toBe(
      'http://cdn.example.com/partial.html',
    );
  });

  it('returns origin root for empty path', () => {
    expect(resolveRelativeUrl('', page)).toBe('https://site.com/');
    expect(resolveRelativeUrl('  ', page)).toBe('https://site.com/');
  });

  it('returns path as-is when URL parsing fails', () => {
    expect(resolveRelativeUrl('https://[', page)).toBe('https://[');
  });

  it('accepts URL base for SSR / tests without location', () => {
    expect(resolveRelativeUrl('x.html', new URL('https://ssr.example/app/'))).toBe(
      'https://ssr.example/x.html',
    );
  });
});

describe('fetchText', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = originalFetch;
  });

  it('returns response text on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '<html/>',
    } as Response);

    await expect(fetchText('http://test/page.html', new AbortController().signal)).resolves.toBe(
      '<html/>',
    );
  });

  it('throws on non-ok HTTP status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await expect(fetchText('http://test/missing', new AbortController().signal)).rejects.toThrow(
      'HTTP 404',
    );
  });
});

describe('createBrowserEnvironment', () => {
  it('exposes browser fetch helpers', () => {
    const env = createBrowserEnvironment();
    expect(env.isSSR).toBe(false);
    expect(env.fetchText).toBe(fetchText);
    expect(env.resolveUrl('partials/a.html')).toContain('/partials/a.html');
  });
});

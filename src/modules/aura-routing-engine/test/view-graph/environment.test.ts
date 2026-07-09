import {
  createBrowserEnvironment,
  fetchText,
  resolveRelativeUrl,
} from '../../core/view-graph/environment';

describe('resolveRelativeUrl', () => {
  it('resolves paths against window.location.origin', () => {
    expect(resolveRelativeUrl('pages/foo.html')).toBe(`${window.location.origin}/pages/foo.html`);
    expect(resolveRelativeUrl('/pages/foo.html')).toBe(`${window.location.origin}/pages/foo.html`);
  });
});

describe('fetchText', () => {
  const fetchMock = jest.fn<typeof fetch>();
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

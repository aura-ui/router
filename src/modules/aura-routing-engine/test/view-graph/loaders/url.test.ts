import { UrlLoader } from '../../../core/view-graph/loaders/url';
import type { ViewLoaderEnv } from '../../../core/view-graph/types';

function env(fetchText: ViewLoaderEnv['fetchText']): ViewLoaderEnv {
  return {
    fetchText,
    resolveUrl: (ref) => `http://test/${ref}`,
    isSSR: false,
  };
}

describe('UrlLoader', () => {
  it('fetches and returns full html when extract is absent', async () => {
    const fetchText = jest.fn().mockResolvedValue('<div id="root">full</div>');
    const loader = new UrlLoader(env(fetchText));

    await expect(
      loader.load({
        content: 'page.html',
        kind: 'view',
        signal: new AbortController().signal,
        route: { href: '/page', pattern: '/page' },
      }),
    ).resolves.toEqual({ kind: 'html', value: '<div id="root">full</div>' });

    expect(fetchText).toHaveBeenCalledWith('http://test/page.html', expect.any(AbortSignal));
  });

  it('extracts a fragment when extract selector is set', async () => {
    const fetchText = jest.fn().mockResolvedValue(
      '<html><body><div id="content"><span>part</span></div></body></html>',
    );
    const loader = new UrlLoader(env(fetchText));

    await expect(
      loader.load({
        content: 'page.html',
        kind: 'view',
        extract: '#content',
        signal: new AbortController().signal,
        route: { href: '/page', pattern: '/page' },
      }),
    ).resolves.toEqual({
      kind: 'html',
      value: '<div id="content"><span>part</span></div>',
    });
  });

  it('falls back to full html when extract selector matches nothing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const full = '<html><body><div id="root">full</div></body></html>';
    const fetchText = jest.fn().mockResolvedValue(full);
    const loader = new UrlLoader(env(fetchText));

    await expect(
      loader.load({
        content: 'page.html',
        kind: 'view',
        extract: '#missing',
        signal: new AbortController().signal,
        route: { href: '/page', pattern: '/page' },
      }),
    ).resolves.toEqual({ kind: 'html', value: full });

    expect(warn).toHaveBeenCalledWith(
      'Nothing found for extract selector "#missing" — using full HTML',
    );
    warn.mockRestore();
  });
});

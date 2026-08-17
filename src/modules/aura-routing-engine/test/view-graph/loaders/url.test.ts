import { UrlLoader } from '../../../core/view-graph/loaders/url';
import type { ViewLoaderEnv } from '../../../core/view-graph/types';
import { createTestLoaderEnv, createViewLoadContext } from '../../_helpers/view-load-context';

function env(fetchText: ViewLoaderEnv['fetchText']): ViewLoaderEnv {
  return createTestLoaderEnv({
    fetchText,
    resolveUrl: (ref) => `http://test/${ref}`,
  });
}

function pageCtx(overrides: Parameters<typeof createViewLoadContext>[0] = {}) {
  return createViewLoadContext({
    content: 'page.html',
    route: { href: '/page', pattern: '/page' },
    ...overrides,
  });
}

describe('UrlLoader', () => {
  it('fetches and returns full html when extract is absent', async () => {
    const fetchText = jest.fn().mockResolvedValue('<div id="root">full</div>');
    const loader = new UrlLoader(env(fetchText));

    await expect(loader.load(pageCtx())).resolves.toEqual({
      kind: 'html',
      value: '<div id="root">full</div>',
      head: undefined,
    });

    expect(fetchText).toHaveBeenCalledWith('http://test/page.html', expect.any(AbortSignal));
  });

  it('extracts a fragment when extract selector is set', async () => {
    const fetchText = jest.fn().mockResolvedValue(
      '<html><body><div id="content"><span>part</span></div></body></html>',
    );
    const loader = new UrlLoader(env(fetchText));

    await expect(loader.load(pageCtx({ extract: '#content' }))).resolves.toEqual({
      kind: 'html',
      value: '<div id="content"><span>part</span></div>',
      head: undefined,
    });
  });

  it('returns document head from the fetched HTML head', async () => {
    const fetchText = jest.fn().mockResolvedValue(
      '<!DOCTYPE html><html><head><title>About</title><meta name="description" content="Desc"></head><body><main id="c">x</main></body></html>',
    );
    const loader = new UrlLoader(env(fetchText));

    await expect(loader.load(pageCtx({ extract: '#c' }))).resolves.toEqual({
      kind: 'html',
      value: '<main id="c">x</main>',
      head: { title: 'About', tags: { 'meta:name:description': 'Desc' } },
    });
  });

  it('falls back to full html when extract selector matches nothing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const full = '<html><body><div id="root">full</div></body></html>';
    const fetchText = jest.fn().mockResolvedValue(full);
    const loader = new UrlLoader(env(fetchText));

    await expect(loader.load(pageCtx({ extract: '#missing' }))).resolves.toEqual({
      kind: 'html',
      value: full,
      head: undefined,
    });

    expect(warn).toHaveBeenCalledWith(
      'Nothing found for extract selector "#missing" — using full HTML. Page — /page',
    );
    warn.mockRestore();
  });
});

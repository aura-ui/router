import { createBrowserEnvironment } from '../../../core/view-graph/environment';
import { HtmlLoader } from '../../../core/view-graph/loaders/html';

describe('HtmlLoader', () => {
  it('returns inline content as html payload', async () => {
    const loader = new HtmlLoader(createBrowserEnvironment());
    await expect(
      loader.load({
        content: '<p>inline</p>',
        kind: 'view',
        signal: new AbortController().signal,
        route: { href: '/x', pattern: '/x' },
      }),
    ).resolves.toEqual({ kind: 'html', value: '<p>inline</p>' });
  });

  it('ignores extract (url-only feature)', async () => {
    const loader = new HtmlLoader(createBrowserEnvironment());
    await expect(
      loader.load({
        content: '<div id="content"><span>part</span></div>',
        kind: 'view',
        extract: '#content',
        signal: new AbortController().signal,
        route: { href: '/x', pattern: '/x' },
      }),
    ).resolves.toEqual({
      kind: 'html',
      value: '<div id="content"><span>part</span></div>',
    });
  });
});

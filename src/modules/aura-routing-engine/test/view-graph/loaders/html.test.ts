import { HtmlLoader } from '../../../core/view-graph/loaders/html';
import { createBrowserEnvironment } from '../../../core/view-graph/environment';

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
});

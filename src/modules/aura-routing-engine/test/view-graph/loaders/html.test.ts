import { HtmlLoader } from '../../../core/view-graph/loaders/html';
import { createBrowserEnvironment } from '../../../core/view-graph/environment';

describe('HtmlLoader', () => {
  it('returns inline ref as html payload', async () => {
    const loader = new HtmlLoader(createBrowserEnvironment());
    await expect(
      loader.load({
        ref: '<p>inline</p>',
        kind: 'view',
        signal: new AbortController().signal,
        route: { href: '/x', pattern: '/x' },
      }),
    ).resolves.toEqual({ kind: 'html', html: '<p>inline</p>' });
  });
});

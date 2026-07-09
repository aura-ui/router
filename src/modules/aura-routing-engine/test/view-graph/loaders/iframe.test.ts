import { IframeLoader } from '../../../core/view-graph/loaders/iframe';
import { createBrowserEnvironment } from '../../../core/view-graph/environment';

describe('IframeLoader', () => {
  it('returns lazy iframe markup with escaped src', async () => {
    const loader = new IframeLoader(createBrowserEnvironment());
    await expect(
      loader.load({
        ref: 'https://example.com/app?x="1"',
        kind: 'view',
        signal: new AbortController().signal,
        route: { href: '/embed', pattern: '/embed' },
      }),
    ).resolves.toEqual({
      kind: 'markup',
      markup: '<iframe src="https://example.com/app?x=&quot;1&quot;" loading="lazy"></iframe>',
    });
  });
});

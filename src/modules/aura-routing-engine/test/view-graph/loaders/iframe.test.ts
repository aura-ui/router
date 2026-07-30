import { createBrowserEnvironment } from '../../../core/view-graph/environment';
import { IframeLoader } from '../../../core/view-graph/loaders/iframe';

describe('IframeLoader', () => {
  it('returns lazy iframe markup with escaped src', async () => {
    const loader = new IframeLoader(createBrowserEnvironment());
    await expect(
      loader.load({
        content: 'https://example.com/app?x="1"',
        kind: 'view',
        signal: new AbortController().signal,
        route: { href: '/embed', pattern: '/embed' },
      }),
    ).resolves.toEqual({
      kind: 'markup',
      value: '<iframe src="https://example.com/app?x=&quot;1&quot;" loading="lazy"></iframe>',
    });
  });
});

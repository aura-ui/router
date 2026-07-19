import { createBrowserEnvironment } from '../../../core/view-graph/environment';
import { ComponentLoader } from '../../../core/view-graph/loaders/component';

describe('ComponentLoader', () => {
  const tag = 'view-graph-test-widget';

  beforeAll(() => {
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }
  });

  it('returns markup with aura-data for a registered element', async () => {
    const loader = new ComponentLoader(createBrowserEnvironment());
    const result = await loader.load({
      content: tag,
      kind: 'view',
      signal: new AbortController().signal,
      route: { href: '/widgets', pattern: '/widgets' },
      data: { id: 1 },
    });

    expect(result?.kind).toBe('markup');
    if (result?.kind === 'markup') {
      expect(result.value).toMatch(new RegExp(`^<${tag} aura-data='`));
      expect(result.value).toContain('&quot;href&quot;:&quot;/widgets&quot;');
      expect(result.value).toContain('&quot;id&quot;:1');
    }
  });

  it('throws when the component is not registered', () => {
    const loader = new ComponentLoader(createBrowserEnvironment());
    expect(() =>
      loader.load({
        content: 'not-registered-widget',
        kind: 'view',
        signal: new AbortController().signal,
        route: { href: '/x', pattern: '/x' },
      }),
    ).toThrow("Component 'not-registered-widget' is not registered");
  });
});

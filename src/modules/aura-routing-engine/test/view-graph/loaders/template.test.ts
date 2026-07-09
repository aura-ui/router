import { TemplateLoader } from '../../../core/view-graph/loaders/template';
import { createBrowserEnvironment } from '../../../core/view-graph/environment';

describe('TemplateLoader', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clones template content by id', async () => {
    const template = document.createElement('template');
    template.id = 'layout-shell';
    template.innerHTML = '<header>App</header>';
    document.body.appendChild(template);

    const loader = new TemplateLoader(createBrowserEnvironment());
    const result = await loader.load({
      content: 'layout-shell',
      kind: 'layout',
      signal: new AbortController().signal,
      route: { href: '/app', pattern: '/app' },
    });

    expect(result?.kind).toBe('fragment');
    if (result?.kind === 'fragment') {
      expect(result.node.textContent).toBe('App');
    }
  });

  it('throws when template id is missing', () => {
    const loader = new TemplateLoader(createBrowserEnvironment());
    expect(() =>
      loader.load({
        content: 'missing',
        kind: 'layout',
        signal: new AbortController().signal,
        route: { href: '/app', pattern: '/app' },
      }),
    ).toThrow('Template with id "missing" not found');
  });
});

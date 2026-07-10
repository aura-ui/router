import { AuraRoute } from '../core/aura-route';

describe('AuraRoute.type', () => {
  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function route(innerHTML = '', attrs: Record<string, string> = {}): AuraRoute {
    const el = document.createElement(AuraRoute.is) as AuraRoute;
    el.setAttribute('path', attrs.path ?? '/');
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'path') continue;
      el.setAttribute(name, value);
    }
    el.innerHTML = innerHTML;
    document.body.append(el);
    return el;
  }

  it('detects page, folder, and redirect', () => {
    expect(route('', { view: 'html::<p>ok</p>' }).type).toBe('page');
    expect(route('', { redirect: '/home' }).type).toBe('redirect');
    expect(route('', { redirect: '   ' }).type).toBe('page');

    const folder = route(
      '<aura-route path="profile" view="html::<p>profile</p>"></aura-route>',
      { layout: 'settings-shell', path: '/settings' },
    );
    expect(folder.type).toBe('folder');
  });

  it('does not treat colocated template alone as folder', () => {
    const el = route('<template id="app-frame"><nav></nav></template>', { path: '/app' });
    expect(el.type).toBe('page');
  });

  it('validates attrs by type', () => {
    expect(() => route('', { path: '/empty' }).validateAttrs()).toThrow('has no view');

    const folder = route(
      '<aura-route path="profile" view="html::<p/>"></aura-route>',
      { path: '/settings' },
    );
    expect(() => folder.validateAttrs()).toThrow('has no layout');

    expect(() => route('', { redirect: '/home', view: 'html::<p/>' }).validateAttrs())
      .toThrow('cannot declare view');
  });

  it('hasViewContent follows type', () => {
    expect(route('', { view: 'html::x' }).hasViewContent).toBe(true);
    expect(route('', { layout: 'shell' }).hasViewContent).toBe(false);
    expect(route('', { redirect: '/home' }).hasViewContent).toBe(false);

    const folder = route(
      '<aura-route path="profile" view="html::x"></aura-route>',
      { layout: 'shell' },
    );
    expect(folder.hasViewContent).toBe(true);
  });
});

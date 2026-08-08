import { defineAuraRoute, mountAuraRoute } from './_helpers';

describe('AuraRoute.type', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('detects page, folder, and redirect', () => {
    expect(mountAuraRoute({ view: 'html::<p>ok</p>' }).type).toBe('page');
    expect(mountAuraRoute({ redirect: '/home' }).type).toBe('redirect');
    expect(mountAuraRoute({ redirect: '   ' }).type).toBe('page');

    const folder = mountAuraRoute(
      { layout: 'settings-shell', path: '/settings' },
      {
        innerHTML: '<aura-route path="profile" view="html::<p>profile</p>"></aura-route>',
      },
    );
    expect(folder.type).toBe('folder');
  });

  it('does not treat colocated template alone as folder', () => {
    const el = mountAuraRoute(
      { path: '/app' },
      { innerHTML: '<template id="app-frame"><nav></nav></template>' },
    );
    expect(el.type).toBe('page');
  });

  it('validates attrs by type', () => {
    expect(() => mountAuraRoute({ path: '/empty' }).validateAttrs()).toThrow('has no view');

    const pathGroup = mountAuraRoute(
      { path: '/settings' },
      {
        innerHTML: '<aura-route path="profile" view="html::<p/>"></aura-route>',
      },
    );
    expect(() => pathGroup.validateAttrs()).not.toThrow();
    expect(pathGroup.hasViewContent).toBe(false);

    expect(() => mountAuraRoute({ redirect: '/home', view: 'html::<p/>' }).validateAttrs())
      .toThrow('cannot declare view');
  });

  it('hasViewContent follows type', () => {
    expect(mountAuraRoute({ view: 'html::x' }).hasViewContent).toBe(true);
    expect(mountAuraRoute({ layout: 'shell' }).hasViewContent).toBe(false);
    expect(mountAuraRoute({ redirect: '/home' }).hasViewContent).toBe(false);

    const folder = mountAuraRoute(
      { layout: 'shell' },
      {
        innerHTML: '<aura-route path="profile" view="html::x"></aura-route>',
      },
    );
    expect(folder.hasViewContent).toBe(true);
  });
});

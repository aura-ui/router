import { AuraRoute } from '../core/aura-route';
import { NO_TRANSITION } from '../core/attr/transition-attr-parser';

describe('AuraRoute transition getter', () => {
  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function mount(attrs: Record<string, string>, routerAttrs: Record<string, string> = {}): AuraRoute {
    const router = document.createElement('aura-router');
    for (const [name, value] of Object.entries(routerAttrs)) {
      router.setAttribute(name, value);
    }
    const route = document.createElement(AuraRoute.is) as AuraRoute;
    route.setAttribute('path', '/');
    for (const [name, value] of Object.entries(attrs)) {
      route.setAttribute(name, value);
    }
    router.append(route);
    document.body.append(router);
    return route;
  }

  it('inherits transition attrs from aura-router', () => {
    const route = mount({}, { 'transition-order': 'out-in', transition: 'fade' });

    expect(route.transition).toEqual({
      order: 'out-in',
      in: ['fade'],
      out: ['fade'],
    });
  });

  it('transition="none" opts out', () => {
    expect(mount({ transition: 'none' }, { transition: 'fade' }).transition).toEqual(NO_TRANSITION);
  });

  it('child overrides shortcut', () => {
    expect(mount({ transition: 'slide' }, { transition: 'fade' }).transition.in).toEqual(['slide']);
  });

  it('transition-out overrides inherited shortcut out', () => {
    const route = mount({ 'transition-out': 'zoom' }, { transition: 'fade' });

    expect(route.transition).toEqual({
      order: 'parallel',
      in: ['fade'],
      out: ['zoom'],
    });
  });

  it('transition-out="none" clears out side from inherited shortcut', () => {
    const route = mount({ 'transition-out': 'none' }, { transition: 'fade' });

    expect(route.transition).toEqual({
      order: 'parallel',
      in: ['fade'],
      out: null,
    });
  });

  it('exposes resolved hooks via getters', () => {
    const route = mount({ transition: 'fade' });

    expect(route.transitionIn).toEqual(['fade']);
    expect(route.transitionOut).toEqual(['fade']);
  });

  it('bare route is NO_TRANSITION', () => {
    const route = document.createElement(AuraRoute.is) as AuraRoute;
    route.setAttribute('path', '/');
    expect(route.transition).toEqual(NO_TRANSITION);
  });
});

describe('AuraRoute hasViewContent', () => {
  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function mount(attrs: Record<string, string>): AuraRoute {
    const route = document.createElement(AuraRoute.is) as AuraRoute;
    route.setAttribute('path', '/');
    for (const [name, value] of Object.entries(attrs)) {
      route.setAttribute(name, value);
    }
    document.body.append(route);
    return route;
  }

  it('is true when layout or view is configured', () => {
    expect(mount({ view: 'html::x' }).hasViewContent).toBe(true);
    expect(mount({ layout: 'shell' }).hasViewContent).toBe(false);
    expect(mount({}).hasViewContent).toBe(false);
  });
});

describe('AuraRoute viewKeySuffix', () => {
  beforeAll(() => {
    if (!customElements.get(AuraRoute.is)) {
      customElements.define(AuraRoute.is, AuraRoute);
    }
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function mount(attrs: Record<string, string>): AuraRoute {
    const route = document.createElement(AuraRoute.is) as AuraRoute;
    route.setAttribute('path', '/');
    for (const [name, value] of Object.entries(attrs)) {
      route.setAttribute(name, value);
    }
    document.body.append(route);
    return route;
  }

  it('builds layout and view slots', () => {
    expect(mount({ layout: 'shell' }).viewKeySuffix).toBe('layout:template:shell');
    expect(mount({ view: 'html::<p/>' }).viewKeySuffix).toBe('view:html:<p/>');
    expect(mount({ view: 'url::page.html', extract: '#main' }).viewKeySuffix).toBe(
      'view:url:page.html::#main',
    );
    expect(mount({}).viewKeySuffix).toBeNull();
  });

  it('invalidates cached slot when layout/view/extract change', () => {
    const route = mount({ view: 'html::a' });
    expect(route.viewKeySuffix).toBe('view:html:a');

    route.setAttribute('view', 'html::b');
    expect(route.viewKeySuffix).toBe('view:html:b');

    route.setAttribute('layout', 'shell');
    expect(route.viewKeySuffix).toBe('layout:template:shell');

    route.removeAttribute('layout');
    route.setAttribute('view', 'url::x.html');
    route.setAttribute('extract', '#c');
    expect(route.viewKeySuffix).toBe('view:url:x.html::#c');
  });
});

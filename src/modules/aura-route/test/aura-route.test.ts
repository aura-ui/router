import { NO_TRANSITION } from '../core/attr/transition-attr-parser';
import {
  createAuraRoute,
  defineAuraRoute,
  mountAuraRoute,
  mountAuraRouteUnderRouter,
} from './_helpers';

describe('AuraRoute transition getter', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('inherits transition attrs from aura-router', () => {
    const route = mountAuraRouteUnderRouter({}, { 'transition-order': 'out-in', transition: 'fade' });

    expect(route.transition).toEqual({
      order: 'out-in',
      in: ['fade'],
      out: ['fade'],
    });
  });

  it('transition="none" opts out', () => {
    expect(mountAuraRouteUnderRouter({ transition: 'none' }, { transition: 'fade' }).transition)
      .toEqual(NO_TRANSITION);
  });

  it('child overrides shortcut', () => {
    expect(mountAuraRouteUnderRouter({ transition: 'slide' }, { transition: 'fade' }).transition.in)
      .toEqual(['slide']);
  });

  it('transition-out overrides inherited shortcut out', () => {
    const route = mountAuraRouteUnderRouter({ 'transition-out': 'zoom' }, { transition: 'fade' });

    expect(route.transition).toEqual({
      order: 'parallel',
      in: ['fade'],
      out: ['zoom'],
    });
  });

  it('transition-out="none" clears out side from inherited shortcut', () => {
    const route = mountAuraRouteUnderRouter({ 'transition-out': 'none' }, { transition: 'fade' });

    expect(route.transition).toEqual({
      order: 'parallel',
      in: ['fade'],
      out: null,
    });
  });

  it('exposes resolved hooks via getters', () => {
    const route = mountAuraRouteUnderRouter({ transition: 'fade' });

    expect(route.transitionIn).toEqual(['fade']);
    expect(route.transitionOut).toEqual(['fade']);
  });

  it('bare route is NO_TRANSITION', () => {
    const route = createAuraRoute();
    expect(route.transition).toEqual(NO_TRANSITION);
  });
});

describe('AuraRoute hasViewContent', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('is true when layout or view is configured', () => {
    expect(mountAuraRoute({ view: 'html::x' }).hasViewContent).toBe(true);
    expect(mountAuraRoute({ layout: 'shell' }).hasViewContent).toBe(false);
    expect(mountAuraRoute({}).hasViewContent).toBe(false);
  });
});

describe('AuraRoute viewKeySuffix', () => {
  beforeAll(() => {
    defineAuraRoute();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('builds layout and view slots', () => {
    expect(mountAuraRoute({ layout: 'shell' }).viewKeySuffix).toBe('layout:template:shell');
    expect(mountAuraRoute({ view: 'html::<p/>' }).viewKeySuffix).toBe('view:html:<p/>');
    expect(mountAuraRoute({ view: 'html::<main id="m">x</main>', extract: '#m' }).viewKeySuffix).toBe(
      'view:html:<main id="m">x</main>',
    );
    expect(mountAuraRoute({ view: 'url::page.html', extract: '#main' }).viewKeySuffix).toBe(
      'view:url:page.html::#main',
    );
    expect(mountAuraRoute({ view: 'url::page.html', extract: 'none' }).viewKeySuffix).toBe(
      'view:url:page.html',
    );
    expect(mountAuraRoute({ view: 'component::x-card', extract: '#main' }).viewKeySuffix).toBe(
      'view:component:x-card',
    );
    expect(mountAuraRoute({}).viewKeySuffix).toBeNull();
  });

  it('invalidates cached slot when layout/view/extract change', () => {
    const route = mountAuraRoute({ view: 'html::a' });
    expect(route.viewKeySuffix).toBe('view:html:a');

    route.setAttribute('view', 'html::b');
    expect(route.viewKeySuffix).toBe('view:html:b');

    route.setAttribute('layout', 'shell');
    expect(route.viewKeySuffix).toBe('layout:template:shell');

    route.removeAttribute('layout');
    route.setAttribute('view', 'url::x.html');
    route.setAttribute('extract', '#c');
    expect(route.viewKeySuffix).toBe('view:url:x.html::#c');

    route.setAttribute('extract', '#d');
    expect(route.viewKeySuffix).toBe('view:url:x.html::#d');

    route.setAttribute('extract', 'none');
    expect(route.viewKeySuffix).toBe('view:url:x.html');
  });
});

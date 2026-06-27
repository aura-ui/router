import { AuraRoute } from '../../core/aura-route';
import {
  NO_TRANSITION,
  buildRouteTransition,
  parseTransitionShortcut,
} from '../../core/transition/transition';
import { parseTransitionOrder } from '../../../aura-routing-engine/core/transition/policy';

describe('parseTransitionOrder', () => {
  it('returns null for unset or invalid', () => {
    expect(parseTransitionOrder(null)).toBeNull();
    expect(parseTransitionOrder('')).toBeNull();
    expect(parseTransitionOrder('foo')).toBeNull();
  });

  it('parses valid policies', () => {
    expect(parseTransitionOrder('parallel')).toBe('parallel');
    expect(parseTransitionOrder('out-in')).toBe('out-in');
  });
});

describe('parseTransitionShortcut', () => {
  it('returns null for unset or empty', () => {
    expect(parseTransitionShortcut(null)).toBeNull();
    expect(parseTransitionShortcut('')).toBeNull();
  });

  it('mirrors in/out for single hook', () => {
    expect(parseTransitionShortcut('fade')).toEqual({ in: ['fade'], out: ['fade'] });
  });

  it('splits out, in for two hooks', () => {
    expect(parseTransitionShortcut('fade, slide')).toEqual({ in: ['slide'], out: ['fade'] });
  });
});

describe('buildRouteTransition', () => {
  it('returns NO_TRANSITION when nothing is set', () => {
    expect(buildRouteTransition({ order: null, shortcut: null, inDecl: null, outDecl: null })).toEqual(NO_TRANSITION);
  });

  it('defaults order to parallel when only shortcut is set', () => {
    expect(buildRouteTransition({
      order: null,
      shortcut: parseTransitionShortcut('fade'),
      inDecl: null,
      outDecl: null,
    })).toEqual({
      order: 'parallel',
      in: ['fade'],
      out: ['fade'],
    });
  });

  it('explicit out decl overrides shortcut out', () => {
    expect(buildRouteTransition({
      order: null,
      shortcut: parseTransitionShortcut('fade, slide'),
      inDecl: null,
      outDecl: ['zoom'],
    })).toEqual({
      order: 'parallel',
      in: ['slide'],
      out: ['zoom'],
    });
  });

  it('explicit in decl overrides shortcut in', () => {
    expect(buildRouteTransition({
      order: null,
      shortcut: parseTransitionShortcut('fade, slide'),
      inDecl: ['zoom'],
      outDecl: null,
    })).toEqual({
      order: 'parallel',
      in: ['zoom'],
      out: ['fade'],
    });
  });

  it('empty decl opts out of shortcut on that side', () => {
    expect(buildRouteTransition({
      order: null,
      shortcut: parseTransitionShortcut('fade'),
      inDecl: null,
      outDecl: [],
    })).toEqual({
      order: 'parallel',
      in: ['fade'],
      out: null,
    });
  });
  it('opts out when optOut is set', () => {
    expect(buildRouteTransition({
      optOut: true,
      order: 'parallel',
      shortcut: parseTransitionShortcut('fade'),
      inDecl: ['zoom'],
      outDecl: null,
    })).toEqual(NO_TRANSITION);
  });
});

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

  it('transition="" opts out', () => {
    expect(mount({ transition: '' }, { transition: 'fade' }).transition).toEqual(NO_TRANSITION);
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

  it('transition-out="" clears out side from inherited shortcut', () => {
    const route = mount({ 'transition-out': '' }, { transition: 'fade' });

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

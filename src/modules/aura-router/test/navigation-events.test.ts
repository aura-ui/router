import {
  AURA_ROUTER_NAVIGATION_CANCEL,
  AURA_ROUTER_NAVIGATION_COMPLETE,
  AURA_ROUTER_NAVIGATION_ERROR,
  AURA_ROUTER_NAVIGATION_REDIRECT,
  AURA_ROUTER_NOT_FOUND,
  dispatchNavigationCancel,
  dispatchNavigationComplete,
  dispatchNavigationError,
  dispatchNavigationRedirect,
  dispatchNotFound,
  type AuraRouterNavigationErrorEventDetail,
} from '../core/navigation-events';
import { FailedNavigation, NavigationError } from '../../aura-routing-engine/core';
import { createTestRoute } from '../../aura-routing-engine/test/helpers/create-test-route';

function matchedFailure(
  overrides: Partial<{
    code: NavigationError['code'];
    phase: NavigationError['phase'];
    view: 'none' | 'staged' | 'committed';
    href: string;
    from: string | null;
  }> = {},
) {
  const href = overrides.href ?? '/x';
  const to = {
    href,
    pathname: href,
    search: '',
    hash: '',
    pattern: href,
    route: createTestRoute(href),
  };
  const from = overrides.from
    ? { href: overrides.from, pathname: overrides.from, search: '', hash: '', pattern: overrides.from, route: createTestRoute(overrides.from) }
    : null;

  return FailedNavigation.fromPipeline(
    new NavigationError({
      code: overrides.code ?? 'RENDER_FAILED',
      phase: overrides.phase ?? 'render',
      routePattern: href,
      message: 'fail',
    }),
    { view: overrides.view ?? 'committed', href },
    from,
    to,
    'push',
  );
}

describe('navigation-events', () => {
  it('dispatchNotFound dispatches cancelable not-found for fallback', () => {
    const router = document.createElement('div');
    const listener = jest.fn((event: Event) => event.preventDefault());

    router.addEventListener(AURA_ROUTER_NOT_FOUND, listener);
    const allowed = dispatchNotFound(router, '/404', 'fallback');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      url: '/404',
      router,
      source: 'fallback',
    });
    expect(allowed).toBe(false);
  });

  it('dispatchNotFound dispatches non-cancelable not-found for route', () => {
    const router = document.createElement('div');
    const listener = jest.fn();

    router.addEventListener(AURA_ROUTER_NOT_FOUND, listener);
    dispatchNotFound(router, '/404', 'route');

    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.cancelable).toBe(false);
    expect(event.detail.source).toBe('route');
  });

  it('dispatchNavigationError maps FailedNavigation to DOM detail', () => {
    const router = document.createElement('div');
    const listener = jest.fn();

    router.addEventListener(AURA_ROUTER_NAVIGATION_ERROR, listener);
    dispatchNavigationError(router, matchedFailure({ from: '/a', href: '/x' }));

    const detail = listener.mock.calls[0][0].detail as AuraRouterNavigationErrorEventDetail;
    expect(detail.code).toBe('RENDER_FAILED');
    expect(detail.from).toBe('/a');
    expect(detail.to).toBe('/x');
    expect(detail.viewCommitted).toBe(true);
  });

  it('dispatchNavigationError forwards guard error fields', () => {
    const router = document.createElement('div');
    const listener = jest.fn();

    router.addEventListener(AURA_ROUTER_NAVIGATION_ERROR, listener);
    dispatchNavigationError(
      router,
      matchedFailure({
        code: 'GUARD_THROW',
        phase: 'guard',
        view: 'none',
        href: '/d',
        from: '/a',
      }),
    );

    expect(listener.mock.calls[0][0].detail).toMatchObject({
      href: '/d',
      from: '/a',
      to: '/d',
      phase: 'guard',
      viewCommitted: false,
      code: 'GUARD_THROW',
    });
  });

  it('dispatchNavigationComplete forwards id', () => {
    const router = document.createElement('div');
    const listener = jest.fn();

    router.addEventListener(AURA_ROUTER_NAVIGATION_COMPLETE, listener);
    dispatchNavigationComplete(router, 7);

    expect(listener.mock.calls[0][0].detail).toEqual({ id: 7, router });
  });

  it('dispatchNavigationCancel forwards id and optional reason', () => {
    const router = document.createElement('div');
    const listener = jest.fn();

    router.addEventListener(AURA_ROUTER_NAVIGATION_CANCEL, listener);
    dispatchNavigationCancel(router, 3, 'superseded');

    expect(listener.mock.calls[0][0].detail).toEqual({
      id: 3,
      router,
      reason: 'superseded',
    });
  });

  it('dispatchNavigationRedirect forwards id, url, replace', () => {
    const router = document.createElement('div');
    const listener = jest.fn();

    router.addEventListener(AURA_ROUTER_NAVIGATION_REDIRECT, listener);
    dispatchNavigationRedirect(router, 2, '/login', true);

    expect(listener.mock.calls[0][0].detail).toEqual({
      id: 2,
      url: '/login',
      replace: true,
      router,
    });
  });
});

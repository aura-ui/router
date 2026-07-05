import type { RouteInstance } from '../../core';
import { resolveHookNames } from '../../core/lifecycle';

function route(overrides: Partial<RouteInstance> = {}): RouteInstance {
  const noop = (): void => {};
  return {
    path: '/',
    guard: null,
    transitionIn: null,
    load: null,
    ready: null,
    leave: null,
    transitionOut: null,
    error: null,
    unmount: null,
    update: null,
    onGuard: noop,
    onTransitionIn: noop,
    onLoad: noop,
    onReady: noop,
    onLeave: noop,
    onTransitionOut: noop,
    onUnmount: noop,
    onUpdate: noop,
    onError: noop,
    transition: { order: null, in: null, out: null },
    ...overrides,
  } as RouteInstance;
}

describe('resolveHookNames', () => {
  it('reads hook names from phase attrs', () => {
    expect(resolveHookNames(route({ ready: ['analytics'] }), 'ready')).toEqual(['analytics']);
    expect(resolveHookNames(route({ unmount: ['abort-polling'] }), 'unmount')).toEqual(['abort-polling']);
    expect(resolveHookNames(route({ update: ['sync'] }), 'update')).toEqual(['sync']);
  });

  it('reads transition hooks from route getters (aura-route)', () => {
    expect(resolveHookNames(route({ transitionIn: ['fade'] }), 'transitionIn')).toEqual(['fade']);
  });

  it('returns null when phase attr is absent (null) or explicit opt-out ([])', () => {
    expect(resolveHookNames(route(), 'guard')).toBeNull();
    expect(resolveHookNames(route({ guard: [] }), 'guard')).toBeNull();
  });
});

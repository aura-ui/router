import type { RouteInstance } from '../../core';
import { resolveHookNames } from '../../core/lifecycle';

function route(overrides: Partial<RouteInstance> = {}): RouteInstance {
  const noop = (): void => {};
  return {
    path: '/',
    enter: null,
    transitionIn: null,
    load: null,
    afterHook: null,
    leave: null,
    transitionOut: null,
    error: null,
    left: null,
    reenter: null,
    onEnter: noop,
    onTransitionIn: noop,
    onLoad: noop,
    onAfter: noop,
    onLeave: noop,
    onTransitionOut: noop,
    onLeft: noop,
    onReenter: noop,
    onError: noop,
    transition: { order: null, in: null, out: null },
    ...overrides,
  };
}

describe('resolveHookNames', () => {
  it('reads hook names from phase attrs', () => {
    expect(resolveHookNames(route({ afterHook: ['analytics'] }), 'after')).toEqual(['analytics']);
    expect(resolveHookNames(route({ left: ['abort-polling'] }), 'left')).toEqual(['abort-polling']);
    expect(resolveHookNames(route({ reenter: ['sync'] }), 'reenter')).toEqual(['sync']);
  });

  it('reads transition hooks from route getters (aura-route)', () => {
    expect(resolveHookNames(route({ transitionIn: ['fade'] }), 'transitionIn')).toEqual(['fade']);
  });

  it('returns null when phase attr is absent (null) or explicit opt-out ([])', () => {
    expect(resolveHookNames(route(), 'enter')).toBeNull();
    expect(resolveHookNames(route({ enter: [] }), 'enter')).toBeNull();
  });
});

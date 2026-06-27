import type { RouteInstance } from '../../../aura-route-hooks/core';

const noop = (): void => {};

export function createTestRoute(path: string, overrides: Partial<RouteInstance> = {}): RouteInstance {
  return {
    path,
    getAttribute(name: string): string | null {
      return name === 'path' ? path : null;
    },
    enter: null,
    transitionIn: null,
    load: null,
    after: null,
    leave: null,
    transitionOut: null,
    left: null,
    reenter: null,
    error: null,
    onEnter: noop,
    onTransitionIn: noop,
    onLoad: noop,
    onAfter: noop,
    onLeave: noop,
    onTransitionOut: noop,
    onLeft: noop,
    onReenter: noop,
    onError: noop,
    commitStagedView: noop,
    ...overrides,
  };
}

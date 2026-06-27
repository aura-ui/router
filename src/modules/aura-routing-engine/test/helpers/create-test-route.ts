import type { RouteInstance, RouteTransition } from '../../core/hooks/types';

const noop = (): void => {};

const INACTIVE_TRANSITION: RouteTransition = { order: null, in: null, out: null };

export function createTestRoute(path: string, overrides: Partial<RouteInstance> = {}): RouteInstance {
  return {
    path,
    getAttribute(name: string): string | null {
      return name === 'path' ? path : null;
    },
    enter: null,
    transitionIn: null,
    load: null,
    afterHook: null,
    leave: null,
    transitionOut: null,
    error: null,
    hooks: null,
    transition: INACTIVE_TRANSITION,
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

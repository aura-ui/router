import type { RouteInstance } from '../../core';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import type { ViewRenderResult } from '../../core/view-mount/view-commit-render';

const noop = (): void => {};

const noopRender = async (): Promise<ViewRenderResult> => ({ status: 'ok' });

const INACTIVE_TRANSITION: RouteTransitionType = { order: null, in: null, out: null };

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
    left: null,
    reenter: null,
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
    render: noopRender,
    ...overrides,
  };
}

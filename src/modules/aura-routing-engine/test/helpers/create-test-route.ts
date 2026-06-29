import type { RouteInstance } from '../../core';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import type { ViewRenderResult } from '../../core/view-mount/view-commit-render';

const noop = (): void => {};

const noopRender = async (): Promise<ViewRenderResult> => ({ status: 'ok' });

const INACTIVE_TRANSITION: RouteTransitionType = { order: null, in: null, out: null };

export function createTestRoute(path: string, overrides: Partial<RouteInstance> = {}): RouteInstance {
  const route = {
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
  } as RouteInstance;

  Object.defineProperties(route, {
    hasEnter: { get(): boolean { return !!route.enter?.length; } },
    hasLeave: { get(): boolean { return !!route.leave?.length; } },
    hasLoad: { get(): boolean { return !!route.load?.length; } },
    hasTransitionIn: { get(): boolean { return !!route.transition.in?.length; } },
    hasPostEffects: {
      get(): boolean {
        return !!route.transition.out?.length || !!route.afterHook?.length;
      },
    },
    hasAsyncContent: {
      get(): boolean {
        return route.hasLoad;
      },
    },
    hasSyncContent: {
      get(): boolean {
        const r = route as RouteInstance & {
          view?: { type: string } | null;
          layout?: string;
          loadingTemplate?: string;
        };
        if (r.layout?.trim()) return false;
        if (route.hasAsyncContent) return false;
        if (r.loadingTemplate?.trim()) return false;
        return r.view?.type === 'html';
      },
    },
  });

  return route;
}

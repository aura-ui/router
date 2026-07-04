import type { RouteInstance } from '../../core';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import type { ViewRenderResult } from '../../core/view-mount/view-commit-render';

const noop = (): void => {};

const noopRender = async (): Promise<ViewRenderResult> => ({ status: 'ok' });

const INACTIVE_TRANSITION: RouteTransitionType = { order: null, in: null, out: null };

export function createTestRoute(
  path: string,
  overrides: Partial<RouteInstance> = {},
): RouteInstance {
  const { preserve = { view: false, data: true }, ...routeOverrides } = overrides;
  const route = {
    path,
    preserve,
    getAttribute(name: string): string | null {
      return name === 'path' ? path : null;
    },
    guard: null,
    transitionIn: null,
    load: null,
    ready: null,
    leave: null,
    transitionOut: null,
    error: null,
    unmount: null,
    reenter: null,
    transition: INACTIVE_TRANSITION,
    onGuard: noop,
    onTransitionIn: noop,
    onLoad: noop,
    onReady: noop,
    onLeave: noop,
    onTransitionOut: noop,
    onUnmount: noop,
    onReenter: noop,
    onError: noop,
    commitStagedView: noop,
    render: noopRender,
    ...routeOverrides,
  } as RouteInstance;

  Object.defineProperties(route, {
    hasGuard: { get(): boolean { return !!route.guard?.length; } },
    hasReenter: { get(): boolean { return !!route.reenter?.length; } },
    hasLeave: { get(): boolean { return !!route.leave?.length; } },
    hasLoad: { get(): boolean { return !!route.load?.length; } },
    hasTransitionIn: { get(): boolean { return !!route.transition.in?.length; } },
    hasReady: {
      get(): boolean {
        return !!route.transition.out?.length || !!route.ready?.length;
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

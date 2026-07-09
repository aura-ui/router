import type { RouteInstance } from '../../core';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import { isAsyncLoader } from '../../../aura-route/core/attr/view-attr-parser';
import type { ViewAttrDescriptor } from '../../../aura-route/core/attr/view-attr-parser';
import type { ViewRenderResult } from '../../core/view-mount/view-commit-render';

const noop = (): void => {};

const noopRender = async (): Promise<ViewRenderResult> => ({ status: 'ok' });

const INACTIVE_TRANSITION: RouteTransitionType = { order: null, in: null, out: null };

/** Default inline sync view for Tier-0 / fast-path test routes (`html::`). */
export const SYNC_HTML_VIEW: ViewAttrDescriptor = { type: 'html', content: '<span/>' };

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
    update: null,
    mountStrategy: null,
    extract: null,
    layout: '',
    loadingTemplate: '',
    view: SYNC_HTML_VIEW,
    transition: INACTIVE_TRANSITION,
    onGuard: noop,
    onTransitionIn: noop,
    onLoad: noop,
    onReady: noop,
    onLeave: noop,
    onTransitionOut: noop,
    onUnmount: noop,
    onUpdate: noop,
    onError: noop,
    commitStagedView: noop,
    applyPreResolved: () => ({ status: 'ok' as const }),
    render: noopRender,
    ...routeOverrides,
  } as RouteInstance;

  Object.defineProperties(route, {
    hasGuard: { get(): boolean { return !!route.guard?.length; } },
    hasUpdate: { get(): boolean { return !!route.update?.length; } },
    hasLeave: { get(): boolean { return !!route.leave?.length; } },
    hasLoad: { get(): boolean { return !!route.load?.length; } },
    hasViewContent: {
      get(): boolean {
        const r = route as RouteInstance & { layout?: string; view?: ViewAttrDescriptor | null };
        return !!r.layout?.trim() || !!r.view;
      },
    },
    hasTransitionIn: { get(): boolean { return !!route.transition.in?.length; } },
    hasReady: {
      get(): boolean {
        return !!route.transition.out?.length || !!route.ready?.length;
      },
    },
    hasAsyncContent: {
      get(): boolean {
        if (route.hasLoad) return true;
        return isAsyncLoader(route.view?.type);
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

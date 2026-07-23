import type { AuraRoute } from '../../../aura-route/core/aura-route';
import type { RouteTransitionType } from '../../../aura-route/core/attr/transition-attr-parser';
import { isAsyncLoader } from '../../../aura-route/core/attr/view-attr-parser';
import type { ViewAttrDescriptor } from '../../../aura-route/core/attr/view-attr-parser';
import type { RouteInstance } from '../../core';
import type { ViewRenderResult } from '../../core/view-mount/view-commit-render';

const noop = (): void => {};

const noopRender = async (): Promise<ViewRenderResult> => ({ status: 'ok' });

const INACTIVE_TRANSITION: RouteTransitionType = { order: null, in: null, out: null };

let testRouteUid = 0;

/** Default inline sync view for Tier-0 / fast-path test routes (`html::`). */
export const SYNC_HTML_VIEW: ViewAttrDescriptor = { loader: 'html', content: '<span/>' };

export function createTestRoute(
  path: string,
  overrides: Partial<RouteInstance> = {},
): AuraRoute {
  const { cache = { dom: false, view: false, data: true }, ...routeOverrides } = overrides;
  const route = {
    uid: ++testRouteUid,
    path,
    cache,
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
    mountStrategy: 'branch',
    extract: null,
    layout: '',
    redirect: '',
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
    hasLayout: {
      get(): boolean {
        return !!(route as RouteInstance & { layout?: string }).layout?.trim();
      },
    },
    hasDataCache: { get(): boolean { return !!route.cache?.data; } },
    hasViewCache: { get(): boolean { return !!route.cache?.view; } },
    hasDomCache: { get(): boolean { return !!route.cache?.dom; } },
    viewKeySuffix: {
      get(): string | null {
        const r = route as RouteInstance & {
          layout?: string;
          view?: ViewAttrDescriptor | null;
          extract?: string | null;
        };
        if (route.hasLayout) return `layout:template:${r.layout!.trim()}`;
        const view = r.view;
        if (!view?.loader || !view.content) return null;
        const slot = `view:${view.loader}:${view.content}`;
        return view.loader === 'url' && r.extract ? `${slot}::${r.extract}` : slot;
      },
    },
    hasViewContent: {
      get(): boolean {
        return route.hasLayout || !!(route as RouteInstance & { view?: ViewAttrDescriptor | null }).view;
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
        return isAsyncLoader(route.view?.loader);
      },
    },
    hasSyncContent: {
      get(): boolean {
        const r = route as RouteInstance & {
          view?: { loader: string } | null;
          loadingTemplate?: string;
        };
        if (route.hasLayout) return false;
        if (route.hasAsyncContent) return false;
        if (r.loadingTemplate?.trim()) return false;
        return r.view?.loader === 'html';
      },
    },
    viewLoaderNeedsData: {
      get(): boolean | undefined {
        const loader = route.view?.loader;
        if (!loader) return undefined;
        // Built-ins that set `static needsData = true` (see view-graph loaders).
        return loader === 'component' || loader === 'import';
      },
    },
  });

  return route as unknown as AuraRoute;
}

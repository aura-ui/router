import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { CacheFlags } from '../../../aura-route/core/attr/cache-attr-parser';
import {
  NO_TRANSITION,
  type RouteTransitionType,
} from '../../../aura-route/core/attr/transition-attr-parser';
import type { ViewAttrDescriptor } from '../../../aura-route/core/attr/view-attr-parser';
import type { AuraRouteInterface } from '../../../aura-route/core/types';
import { domCacheKey } from '../../../aura-route/core/view/dom-cache';
import { RouteViewController } from '../../../aura-route/core/view/view-controller';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import type { RouteInstance, RouteLifecycleContext } from '../../core/route/types';
import type { ViewGraph } from '../../core/view-graph';

export type WireRouteViewControllerOptions = {
  outlet: AuraOutlet;
  /** Route record mutated with render / commit / lifecycle bindings. */
  route: RouteInstance;
  /** Assigned to `route.path` when provided (e.g. `node.pattern`). */
  path?: string;
  loadView: ViewGraph['loadView'];
  /** When true, stash-backed DOM cache is wired. Default: `false`. */
  cacheDom?: boolean;
  /** Override cache flags; defaults from {@link cacheDom}. */
  cache?: CacheFlags;
  transition?: RouteTransitionType;
  onTransitionOut?: (ctx: RouteLifecycleContext, outlet: AuraOutlet) => void;
  onTransitionIn?: (ctx: RouteLifecycleContext, outlet: AuraOutlet) => void;
  /** Wire `onUnmount` → controller + pass-id bump. Default: `true`. */
  wireUnmount?: boolean;
  /** Wire `mountResolvedView`. Default: `true`. */
  wireMountResolvedView?: boolean;
  /** Wire `revertInFlightView`. Default: `false`. */
  wireRevertInFlight?: boolean;
};

export type WiredRouteViewController = {
  controller: RouteViewController;
  stash: Map<string, HTMLElement>;
  loadView: ViewGraph['loadView'];
};

/** Writable test record that satisfies {@link AuraRouteInterface} for RouteViewController. */
type MutableRouteRecord = Omit<RouteInstance, 'extract' | 'transition'> & {
  path: string;
  layout: string;
  redirect: string;
  type: AuraRouteInterface['type'];
  view: ViewAttrDescriptor | null;
  loadingTemplate: string | null;
  loadingBodyClass: string | null;
  loadingStartEvent: string | null;
  loadingEndEvent: string | null;
  errorTemplate: string | null;
  scrollPolicy: null;
  extract: string | null;
  cache: CacheFlags;
  transition: RouteTransitionType;
  transitionIn: string[] | null;
  transitionOut: string[] | null;
  resolveAndMountView: RouteViewController['resolveAndMountView'];
  mountResolvedView: RouteViewController['mountResolvedView'];
  revertInFlightView: () => void;
  onUnmount: (ctx: RouteLifecycleContext) => void;
  onTransitionOut: (ctx: RouteLifecycleContext) => void;
  onTransitionIn: (ctx: RouteLifecycleContext) => void;
  commitStagedView: () => void;
};

/** Wire a real {@link RouteViewController} onto a test route record + outlet. */
export function wireRouteViewController(
  options: WireRouteViewControllerOptions,
): WiredRouteViewController {
  const {
    outlet,
    loadView,
    cacheDom = false,
    transition = NO_TRANSITION,
    wireUnmount = true,
    wireMountResolvedView = true,
    wireRevertInFlight = false,
  } = options;

  let passId = 0;
  const stash = new Map<string, HTMLElement>();
  const routeRecord = options.route as MutableRouteRecord;

  if (options.path != null) routeRecord.path = options.path;
  routeRecord.layout = '';
  routeRecord.redirect = routeRecord.redirect ?? '';
  routeRecord.type = routeRecord.type ?? 'page';
  routeRecord.view = (routeRecord.view ?? null) as ViewAttrDescriptor | null;
  routeRecord.loadingTemplate = routeRecord.loadingTemplate ?? '';
  routeRecord.loadingBodyClass = routeRecord.loadingBodyClass ?? null;
  routeRecord.loadingStartEvent = routeRecord.loadingStartEvent ?? null;
  routeRecord.loadingEndEvent = routeRecord.loadingEndEvent ?? null;
  routeRecord.errorTemplate = routeRecord.errorTemplate ?? '';
  routeRecord.scrollPolicy = null;
  routeRecord.extract = routeRecord.extract ?? null;
  routeRecord.cache = options.cache ?? { dom: cacheDom, view: false, data: false };
  routeRecord.transition = transition;
  routeRecord.transitionIn = transition.in;
  routeRecord.transitionOut = transition.out;

  const controller = new RouteViewController(
    {
      route: routeRecord,
      view: { loadView },
      cache: cacheDom
        ? {
            has: (key) => stash.has(key),
            extract: (key) => {
              const root = stash.get(key);
              if (root) stash.delete(key);
              return root;
            },
            put: (key, root) => {
              stash.set(key, root);
            },
          }
        : {
            has: () => false,
            extract: () => undefined,
            put: () => {},
          },
      mountTarget: {
        appOutlet: () => outlet,
        nestedOutlet: () => null,
      },
    },
    () => passId,
  );

  routeRecord.resolveAndMountView = (info, renderOptions) => controller.resolveAndMountView(info, renderOptions);
  routeRecord.commitStagedView = () => controller.commitStagedView();

  if (wireMountResolvedView) {
    routeRecord.mountResolvedView = (info, applyOptions) =>
      controller.mountResolvedView(info, applyOptions);
  }
  if (wireRevertInFlight) {
    routeRecord.revertInFlightView = () => controller.revertInFlightView();
  }
  if (wireUnmount) {
    routeRecord.onUnmount = (ctx) => {
      passId++;
      controller.onUnmount({ domCacheKey: domCacheKey(ctx.to, routeRecord.path) });
    };
  }
  // Always overwrite so createTestRoute noops don't leak past wired hooks.
  routeRecord.onTransitionOut = (ctx) => options.onTransitionOut?.(ctx, outlet);
  routeRecord.onTransitionIn = (ctx) => options.onTransitionIn?.(ctx, outlet);

  return { controller, stash, loadView };
}

/** `loadView` that resolves markup from the matched `params.id`. */
export function loadViewFromParamId(
  resolve: (id: string) => string,
): ViewGraph['loadView'] {
  return async (info: MatchedRouteInfo) => ({ data: resolve(info.params?.id ?? '?') });
}

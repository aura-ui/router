import { AuraOutlet } from '../../../aura-outlet/core/aura-outlet';
import type { CacheFlags } from '../../../aura-route/core/attr/cache-attr-parser';
import {
  NO_TRANSITION,
  type RouteTransitionType,
} from '../../../aura-route/core/attr/transition-attr-parser';
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
  /** Wire `applyPreResolved`. Default: `true`. */
  wireApplyPreResolved?: boolean;
  /** Wire `revertInFlightView`. Default: `false`. */
  wireRevertInFlight?: boolean;
};

export type WiredRouteViewController = {
  controller: RouteViewController;
  stash: Map<string, Element>;
  loadView: ViewGraph['loadView'];
};

type MutableRouteRecord = RouteInstance & {
  path: string;
  layout: string;
  view: unknown;
  loadingTemplate: string;
  errorTemplate: string;
  scrollPolicy: null;
  cache: CacheFlags;
  transition: RouteTransitionType;
  transitionIn: string[] | null;
  transitionOut: string[] | null;
  render: RouteViewController['render'];
  applyPreResolved: RouteViewController['applyPreResolved'];
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
    wireApplyPreResolved = true,
    wireRevertInFlight = false,
  } = options;

  let passId = 0;
  const stash = new Map<string, Element>();
  const routeRecord = options.route as MutableRouteRecord;

  if (options.path != null) routeRecord.path = options.path;
  routeRecord.layout = '';
  routeRecord.view = routeRecord.view ?? null;
  routeRecord.loadingTemplate = routeRecord.loadingTemplate ?? '';
  routeRecord.errorTemplate = routeRecord.errorTemplate ?? '';
  routeRecord.scrollPolicy = null;
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

  routeRecord.render = (info, renderOptions) => controller.render(info, renderOptions);
  routeRecord.commitStagedView = () => controller.commitStagedView();

  if (wireApplyPreResolved) {
    routeRecord.applyPreResolved = (info, applyOptions) =>
      controller.applyPreResolved(info, applyOptions);
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

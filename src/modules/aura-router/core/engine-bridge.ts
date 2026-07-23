import { isCatchAllRoutePattern } from '../../aura-routing-engine/core';
import {
  AURA_ROUTER_LOAD_END,
  AURA_ROUTER_LOAD_ERROR,
  AURA_ROUTER_LOAD_START,
  AURA_ROUTER_NAVIGATION,
  AURA_ROUTER_NAVIGATION_CANCEL,
  AURA_ROUTER_NAVIGATION_COMPLETE,
  AURA_ROUTER_NAVIGATION_REDIRECT,
  AURA_ROUTER_NAVIGATION_START,
  dispatchNavigationError,
  dispatchNavigationHookError,
  dispatchNotFound,
  emit,
} from './navigation-events';
import type {
  AuraRoutingEngineConfig,
  EngineEvent,
  MatchedRouteInfo,
} from '../../aura-routing-engine/core';
import type { AuraRouterNotFoundController } from './not-found-controller';
import type { ScrollRestoration } from './scroll-restoration';

/** Deps the engine↔host bridge needs from `<aura-router>` (not the whole element API). */
export type RouterEngineBridgeDeps = {
  notFound: Pick<AuraRouterNotFoundController, 'recover' | 'clear'>;
  scrollRestoration: Pick<ScrollRestoration, 'apply'>;
  syncBranchAndActiveLinks: (to: MatchedRouteInfo) => void;
  onHashOnlyNavigation: (href: string) => void;
};

export type RouterEngineBridge = {
  config: Pick<
    AuraRoutingEngineConfig,
    'onNotFound' | 'onHashOnlyNavigation' | 'onNavigationHookError'
  >;
  onEvent: (event: EngineEvent) => void;
};

function navigationDomDetail(from: MatchedRouteInfo | null | undefined, to: MatchedRouteInfo) {
  return {
    from: from?.pathname ?? null,
    to: to.href,
    pathname: to.pathname,
  };
}

/** Apply callbacks + bus→DOM/chrome adapter for {@link AuraRoutingEngine}. */
export function connectRouterEngine(
  host: HTMLElement,
  deps: RouterEngineBridgeDeps,
): RouterEngineBridge {
  return {
    config: {
      onNotFound: (failure) => {
        if (dispatchNotFound(host, failure.href, 'fallback')) {
          deps.notFound.recover(failure.href);
        }
      },
      onHashOnlyNavigation: deps.onHashOnlyNavigation,
      onNavigationHookError: (detail) => {
        dispatchNavigationHookError(host, detail);
      },
    },
    onEvent: (event) => onEngineEvent(host, deps, event),
  };
}

/**
 * Host chrome adapter over the engine event stream.
 * Early: `url-aligned` → active links / `navigation-start`.
 * Stay: `nav-state-restore` → active links / branch after cancel-pending.
 * Loads: `load:*` → `load-start` / `load-end` / `load-error`.
 * Late: `commit:end` → scroll, not-found, active links again, DOM `navigation`.
 * Terminal: `finish` / `cancel` / `redirect` / `error` → DOM counterparts.
 */
function onEngineEvent(
  host: HTMLElement,
  deps: RouterEngineBridgeDeps,
  event: EngineEvent,
): void {
  const { notFound, scrollRestoration, syncBranchAndActiveLinks } = deps;

  switch (event.type) {
    case 'navigation:url-aligned':
      syncBranchAndActiveLinks(event.to);
      emit(host, AURA_ROUTER_NAVIGATION_START, navigationDomDetail(event.from, event.to));
      return;

    case 'navigation:nav-state-restore':
      syncBranchAndActiveLinks(event.to);
      return;

    case 'load:start':
      emit(host, AURA_ROUTER_LOAD_START, {
        id: event.id,
        nodeId: event.nodeId,
        pattern: event.pattern,
      });
      return;

    case 'load:end':
      emit(host, AURA_ROUTER_LOAD_END, {
        id: event.id,
        nodeId: event.nodeId,
        pattern: event.pattern,
      });
      return;

    case 'load:error':
      emit(host, AURA_ROUTER_LOAD_ERROR, {
        id: event.id,
        nodeId: event.nodeId,
        pattern: event.pattern,
        error: event.error,
      });
      return;

    case 'navigation:commit:end':
      notFound.clear();
      if (isCatchAllRoutePattern(event.to.pattern)) {
        dispatchNotFound(host, event.to.href, 'route');
      }
      scrollRestoration.apply({
        from: event.from,
        to: event.to,
        action: event.action,
        hash: event.hash,
      });
      syncBranchAndActiveLinks(event.to);
      emit(host, AURA_ROUTER_NAVIGATION, navigationDomDetail(event.from, event.to));
      return;

    case 'navigation:finish':
      emit(host, AURA_ROUTER_NAVIGATION_COMPLETE, { id: event.id });
      return;

    case 'navigation:cancel':
      emit(host, AURA_ROUTER_NAVIGATION_CANCEL, { id: event.id, reason: event.reason });
      return;

    case 'navigation:redirect':
      emit(host, AURA_ROUTER_NAVIGATION_REDIRECT, {
        id: event.id,
        url: event.url,
        replace: event.replace,
      });
      return;

    case 'navigation:error':
      if (event.failure.viewCommitted) {
        notFound.clear();
      }
      // Fallback NOT_FOUND already handled in config `onNotFound` (DOM + recover).
      if (event.failure.isNotFound) {
        return;
      }
      dispatchNavigationError(host, event.failure);
      return;

    default:
      // prepare/commit:start and other bus noise — host chrome ignores.
      return;
  }
}

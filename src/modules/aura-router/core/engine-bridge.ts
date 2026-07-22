import {
  isCatchAllRoutePattern,
  type AuraRoutingEngineConfig,
  type EngineEvent,
  type MatchedRouteInfo,
} from '../../aura-routing-engine/core';

import type { AuraRouterNotFoundController } from './not-found-controller';
import {
  dispatchLoadEnd,
  dispatchLoadError,
  dispatchLoadStart,
  dispatchNavigationCancel,
  dispatchNavigationCommitted,
  dispatchNavigationComplete,
  dispatchNavigationError,
  dispatchNavigationHookError,
  dispatchNavigationRedirect,
  dispatchNavigationStart,
  dispatchNotFound,
} from './navigation-events';
import type { ScrollRestoration } from './scroll-restoration';

/** Deps the engine↔host bridge needs from `<aura-router>` (not the whole element API). */
export type RouterEngineBridgeDeps = {
  notFound: Pick<AuraRouterNotFoundController, 'recover' | 'clear'>;
  scrollRestoration: Pick<ScrollRestoration, 'handleCommit'>;
  syncNavState: (to: MatchedRouteInfo) => void;
  onHashOnlyNavigation: (href: string) => void;
};

export type RouterEngineBridge = {
  config: Pick<
    AuraRoutingEngineConfig,
    'onNotFound' | 'onHashOnlyNavigation' | 'onNavigationHookError'
  >;
  onEvent: (event: EngineEvent) => void;
};

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
  const { notFound, scrollRestoration, syncNavState } = deps;

  if (event.type === 'navigation:url-aligned') {
    dispatchNavigationStart(host, {
      from: event.from?.pathname ?? null,
      to: event.to.href,
      pathname: event.to.pathname,
    });
    syncNavState(event.to);
    return;
  }

  if (event.type === 'navigation:nav-state-restore') {
    syncNavState(event.to);
    return;
  }

  if (event.type === 'load:start') {
    dispatchLoadStart(host, event.id, event.nodeId, event.pattern);
    return;
  }

  if (event.type === 'load:end') {
    dispatchLoadEnd(host, event.id, event.nodeId, event.pattern);
    return;
  }

  if (event.type === 'load:error') {
    dispatchLoadError(host, event.id, event.nodeId, event.pattern, event.error);
    return;
  }

  if (event.type === 'navigation:commit:end') {
    notFound.clear();
    if (isCatchAllRoutePattern(event.to.pattern)) {
      dispatchNotFound(host, event.to.href, 'route');
    }
    scrollRestoration.handleCommit({
      from: event.from,
      to: event.to,
      action: event.action,
      hash: event.hash,
    });
    dispatchNavigationCommitted(host, {
      from: event.from?.pathname ?? null,
      to: event.to.href,
      pathname: event.to.pathname,
    });
    syncNavState(event.to);
    return;
  }

  if (event.type === 'navigation:finish') {
    dispatchNavigationComplete(host, event.id);
    return;
  }

  if (event.type === 'navigation:cancel') {
    dispatchNavigationCancel(host, event.id, event.reason);
    return;
  }

  if (event.type === 'navigation:redirect') {
    dispatchNavigationRedirect(host, event.id, event.url, event.replace);
    return;
  }

  if (event.type === 'navigation:error') {
    if (event.failure.viewCommitted) {
      notFound.clear();
    }
    // Fallback NOT_FOUND already handled in config `onNotFound` (DOM + recover).
    if (event.failure.isNotFound) {
      return;
    }
    dispatchNavigationError(host, event.failure);
  }
}

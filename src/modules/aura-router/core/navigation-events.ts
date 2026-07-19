import type {
  FailedNavigation,
  NavigationErrorPhase,
  NavigationFailureCode,
  NavigationHookErrorDetail,
} from '../../aura-routing-engine/core';
import { dispatchCustomEvent } from '../../aura-utils/misc';

export type { NavigationErrorPhase, NavigationFailureCode };

/** CustomEvent name: `not-found` */
export const AURA_ROUTER_NOT_FOUND = 'not-found';

export type NotFoundSource = 'route' | 'fallback';

/** Fallback / configure handler — public router API. */
export type NotFoundHandler = (url: string, router: HTMLElement) => void;

export interface AuraRouterNotFoundEventDetail {
  url: string;
  router: HTMLElement;
  source: NotFoundSource;
}

export type AuraRouterNotFoundEvent = CustomEvent<AuraRouterNotFoundEventDetail>;

/** CustomEvent name: `navigation-error` */
export const AURA_ROUTER_NAVIGATION_ERROR = 'navigation-error';

export interface AuraRouterNavigationErrorEventDetail {
  error: unknown;
  href: string;
  router: HTMLElement;
  from: string | null;
  /** Matched target pathname, or `null` for pre-match failures (`NOT_FOUND` / redirect-cycle). */
  to: string | null;
  phase: NavigationErrorPhase;
  viewCommitted: boolean;
  code: NavigationFailureCode;
}

export type AuraRouterNavigationErrorEvent = CustomEvent<AuraRouterNavigationErrorEventDetail>;

/** CustomEvent name: `navigation-hook-error` */
export const AURA_ROUTER_NAVIGATION_HOOK_ERROR = 'navigation-hook-error';

export interface AuraRouterNavigationHookErrorEventDetail {
  error: unknown;
  router: HTMLElement;
  phase: 'error';
  parent: AuraRouterNavigationErrorEventDetail;
}

export type AuraRouterNavigationHookErrorEvent =
  CustomEvent<AuraRouterNavigationHookErrorEventDetail>;

/** Dispatches `not-found`. Returns `false` when `defaultPrevented` (fallback only). */
export function dispatchNotFound(
  router: HTMLElement,
  url: string,
  source: NotFoundSource,
): boolean {
  return dispatchCustomEvent(router, AURA_ROUTER_NOT_FOUND, {
    detail: { url, router, source },
    cancelable: source === 'fallback',
  });
}

/** Maps {@link FailedNavigation} to flat DOM event fields. */
export function toRouterNavigationErrorDetail(
  failure: FailedNavigation,
): Omit<AuraRouterNavigationErrorEventDetail, 'router'> {
  return {
    error: failure.error,
    href: failure.href,
    from: failure.from?.pathname ?? null,
    to: failure.to?.pathname ?? null,
    phase: failure.error.phase,
    viewCommitted: failure.viewCommitted,
    code: failure.error.code,
  };
}

/** Dispatches `navigation-error` from engine {@link FailedNavigation}. */
export function dispatchNavigationError(
  router: HTMLElement,
  failure: FailedNavigation,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_NAVIGATION_ERROR, {
    detail: {
      router,
      ...toRouterNavigationErrorDetail(failure),
    } satisfies AuraRouterNavigationErrorEventDetail,
  });
}

/** Dispatches `navigation-hook-error` when an `error="…"` hook throws. */
export function dispatchNavigationHookError(
  router: HTMLElement,
  detail: NavigationHookErrorDetail,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_NAVIGATION_HOOK_ERROR, {
    detail: {
      error: detail.error,
      router,
      phase: 'error',
      parent: {
        router,
        ...toRouterNavigationErrorDetail(detail.parent),
      },
    } satisfies AuraRouterNavigationHookErrorEventDetail,
  });

  console.error('[error] hook failed:', detail.error);
}

/** CustomEvent name: `data-invalidated` */
export const AURA_ROUTER_DATA_INVALIDATED = 'data-invalidated';

/** CustomEvent name: `navigation-start` — after history commit, before render. */
export const AURA_ROUTER_NAVIGATION_START = 'navigation-start';

export type AuraRouterNavigationStartEventDetail = AuraRouterNavigationEventDetail;
export type AuraRouterNavigationStartEvent = CustomEvent<AuraRouterNavigationStartEventDetail>;

/** CustomEvent name: `navigation` — after view commit succeeded. */
export const AURA_ROUTER_NAVIGATION = 'navigation';

export interface AuraRouterNavigationEventDetail {
  from: string | null;
  to: string;
  pathname: string;
  router: HTMLElement;
}

export type AuraRouterNavigationEvent = CustomEvent<AuraRouterNavigationEventDetail>;

export interface AuraRouterDataInvalidatedEventDetail {
  count: number;
  router: HTMLElement;
}

export type AuraRouterDataInvalidatedEvent = CustomEvent<AuraRouterDataInvalidatedEventDetail>;

/** Dispatches `data-invalidated` after {@link AuraRouter.invalidate}. */
export function dispatchDataInvalidated(router: HTMLElement, count: number): void {
  dispatchCustomEvent(router, AURA_ROUTER_DATA_INVALIDATED, {
    detail: { count, router },
  });
}

/** Dispatches `navigation-start` after post-load history commit. */
export function dispatchNavigationStart(
  router: HTMLElement,
  detail: Omit<AuraRouterNavigationEventDetail, 'router'>,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_NAVIGATION_START, {
    detail: { ...detail, router },
  });
}

/** Dispatches `navigation` after view commit and successful view transition. */
export function dispatchNavigationCommitted(
  router: HTMLElement,
  detail: Omit<AuraRouterNavigationEventDetail, 'router'>,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_NAVIGATION, {
    detail: { ...detail, router },
  });
}

/** CustomEvent name: `navigation-complete` — terminal success (`navigation:finish`). */
export const AURA_ROUTER_NAVIGATION_COMPLETE = 'navigation-complete';

export interface AuraRouterNavigationCompleteEventDetail {
  id: number;
  router: HTMLElement;
}

export type AuraRouterNavigationCompleteEvent =
  CustomEvent<AuraRouterNavigationCompleteEventDetail>;

/** CustomEvent name: `navigation-cancel` — terminal cancel / supersede. */
export const AURA_ROUTER_NAVIGATION_CANCEL = 'navigation-cancel';

export interface AuraRouterNavigationCancelEventDetail {
  id: number;
  router: HTMLElement;
  reason?: string;
}

export type AuraRouterNavigationCancelEvent =
  CustomEvent<AuraRouterNavigationCancelEventDetail>;

/** CustomEvent name: `navigation-redirect` — terminal redirect. */
export const AURA_ROUTER_NAVIGATION_REDIRECT = 'navigation-redirect';

export interface AuraRouterNavigationRedirectEventDetail {
  id: number;
  url: string;
  replace: boolean;
  router: HTMLElement;
}

export type AuraRouterNavigationRedirectEvent =
  CustomEvent<AuraRouterNavigationRedirectEventDetail>;

/** Dispatches `navigation-complete` from bus `navigation:finish`. */
export function dispatchNavigationComplete(router: HTMLElement, id: number): void {
  dispatchCustomEvent(router, AURA_ROUTER_NAVIGATION_COMPLETE, {
    detail: { id, router } satisfies AuraRouterNavigationCompleteEventDetail,
  });
}

/** Dispatches `navigation-cancel` from bus `navigation:cancel`. */
export function dispatchNavigationCancel(
  router: HTMLElement,
  id: number,
  reason?: string,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_NAVIGATION_CANCEL, {
    detail: { id, router, reason } satisfies AuraRouterNavigationCancelEventDetail,
  });
}

/** Dispatches `navigation-redirect` from bus `navigation:redirect`. */
export function dispatchNavigationRedirect(
  router: HTMLElement,
  id: number,
  url: string,
  replace: boolean,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_NAVIGATION_REDIRECT, {
    detail: { id, url, replace, router } satisfies AuraRouterNavigationRedirectEventDetail,
  });
}

/** CustomEvent name: `load-start` — bus `load:start` (per enter route). */
export const AURA_ROUTER_LOAD_START = 'load-start';

/** CustomEvent name: `load-end` — bus `load:end`. */
export const AURA_ROUTER_LOAD_END = 'load-end';

/** CustomEvent name: `load-error` — bus `load:error`. */
export const AURA_ROUTER_LOAD_ERROR = 'load-error';

export interface AuraRouterLoadEventDetail {
  id: number;
  nodeId: string;
  pattern: string;
  router: HTMLElement;
}

export type AuraRouterLoadStartEvent = CustomEvent<AuraRouterLoadEventDetail>;
export type AuraRouterLoadEndEvent = CustomEvent<AuraRouterLoadEventDetail>;

export interface AuraRouterLoadErrorEventDetail extends AuraRouterLoadEventDetail {
  error: unknown;
}

export type AuraRouterLoadErrorEvent = CustomEvent<AuraRouterLoadErrorEventDetail>;

/** Dispatches `load-start` from bus `load:start`. */
export function dispatchLoadStart(
  router: HTMLElement,
  id: number,
  nodeId: string,
  pattern: string,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_LOAD_START, {
    detail: { id, nodeId, pattern, router } satisfies AuraRouterLoadEventDetail,
  });
}

/** Dispatches `load-end` from bus `load:end`. */
export function dispatchLoadEnd(
  router: HTMLElement,
  id: number,
  nodeId: string,
  pattern: string,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_LOAD_END, {
    detail: { id, nodeId, pattern, router } satisfies AuraRouterLoadEventDetail,
  });
}

/** Dispatches `load-error` from bus `load:error`. */
export function dispatchLoadError(
  router: HTMLElement,
  id: number,
  nodeId: string,
  pattern: string,
  error: unknown,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_LOAD_ERROR, {
    detail: { id, nodeId, pattern, error, router } satisfies AuraRouterLoadErrorEventDetail,
  });
}

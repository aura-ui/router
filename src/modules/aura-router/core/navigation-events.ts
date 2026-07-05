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
  to: string;
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
  if (!failure.to) {
    throw new Error('NOT_FOUND failure has no matched route');
  }

  return {
    error: failure.error,
    href: failure.href,
    from: failure.from?.pathname ?? null,
    to: failure.to.pathname,
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

/** CustomEvent name: `navigation` — after URL and view commit succeeded. */
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

/** Dispatches `navigation` after history commit and successful view transition. */
export function dispatchNavigationCommitted(
  router: HTMLElement,
  detail: Omit<AuraRouterNavigationEventDetail, 'router'>,
): void {
  dispatchCustomEvent(router, AURA_ROUTER_NAVIGATION, {
    detail: { ...detail, router },
  });
}

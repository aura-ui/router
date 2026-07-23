import { dispatchCustomEvent } from '../../aura-utils/misc';
import type {
  NavigationFailure,
  NavigationErrorPhase,
  NavigationFailureCode,
  NavigationHookErrorDetail,
} from '../../aura-routing-engine/core';

/** Emit a router DOM event; always injects `router` into `detail`. */
export function emit<T extends object>(router: HTMLElement, type: string, detail: T, init?: Omit<CustomEventInit, 'detail'>): boolean {
  return dispatchCustomEvent(router, type, { ...init, detail: { ...detail, router } });
}

/** CustomEvent name: `navigation-start` — after history commit, before render. */
export const AURA_ROUTER_NAVIGATION_START = 'navigation-start';

/** CustomEvent name: `navigation` — after view commit succeeded. */
export const AURA_ROUTER_NAVIGATION = 'navigation';

export interface AuraRouterNavigationEventDetail {
  from: string | null;
  to: string;
  pathname: string;
  router: HTMLElement;
}

export type AuraRouterNavigationEvent = CustomEvent<AuraRouterNavigationEventDetail>;
export type AuraRouterNavigationStartEventDetail = AuraRouterNavigationEventDetail;
export type AuraRouterNavigationStartEvent = CustomEvent<AuraRouterNavigationStartEventDetail>;

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

/** Maps {@link NavigationFailure} to flat DOM event fields. */
export function toRouterNavigationErrorDetail(
  failure: NavigationFailure,
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

/** Dispatches `navigation-error` from engine {@link NavigationFailure}. */
export function dispatchNavigationError(
  router: HTMLElement,
  failure: NavigationFailure,
): void {
  emit(router, AURA_ROUTER_NAVIGATION_ERROR, toRouterNavigationErrorDetail(failure));
}

/** Dispatches `navigation-hook-error` when an `error="…"` hook throws. */
export function dispatchNavigationHookError(
  router: HTMLElement,
  detail: NavigationHookErrorDetail,
): void {
  emit(router, AURA_ROUTER_NAVIGATION_HOOK_ERROR, {
    error: detail.error,
    phase: 'error' as const,
    parent: {
      router,
      ...toRouterNavigationErrorDetail(detail.parent),
    },
  });
  console.error('[error] hook failed:', detail.error);
}

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

/** Dispatches `not-found`. Returns `false` when `defaultPrevented` (fallback only). */
export function dispatchNotFound(router: HTMLElement, url: string, source: NotFoundSource): boolean {
  return emit(router, AURA_ROUTER_NOT_FOUND, { url, source }, {
    cancelable: source === 'fallback',
  });
}

/** CustomEvent name: `data-invalidated` */
export const AURA_ROUTER_DATA_INVALIDATED = 'data-invalidated';

export interface AuraRouterDataInvalidatedEventDetail {
  count: number;
  router: HTMLElement;
}

export type AuraRouterDataInvalidatedEvent = CustomEvent<AuraRouterDataInvalidatedEventDetail>;

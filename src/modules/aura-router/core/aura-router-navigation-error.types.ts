/** CustomEvent name: `navigation-error` */
export const AURA_ROUTER_NAVIGATION_ERROR = 'navigation-error';

export interface AuraRouterNavigationErrorEventDetail {
  error: unknown;
  url: string;
  router: HTMLElement;
  from: string | null;
  to: string;
}

export type AuraRouterNavigationErrorEvent = CustomEvent<AuraRouterNavigationErrorEventDetail>;

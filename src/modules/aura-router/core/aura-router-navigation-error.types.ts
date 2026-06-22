import type { NavigationErrorPhase } from '../../aura-routing-engine/core';

/** CustomEvent name: `navigation-error` */
export const AURA_ROUTER_NAVIGATION_ERROR = 'navigation-error';

export type { NavigationErrorPhase };

export interface AuraRouterNavigationErrorEventDetail {
  error: unknown;
  url: string;
  router: HTMLElement;
  from: string | null;
  to: string;
  phase: NavigationErrorPhase;
  committed: boolean;
}

export type AuraRouterNavigationErrorEvent = CustomEvent<AuraRouterNavigationErrorEventDetail>;

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

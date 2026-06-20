import type { NotFoundHandler, NotFoundSource } from './aura-router-not-found.types';
import { AURA_ROUTER_NOT_FOUND } from './aura-router-not-found.types';
import { AuraRouterOutlet } from '../../aura-router-outlet/core';
import { dispatchCustomEvent } from '../../aura-utils/misc';

export { AURA_ROUTER_NOT_FOUND };

export interface AuraRouterNotFoundHost extends HTMLElement {
  notFoundTemplate: string;
}

let configuredNotFoundHandler: NotFoundHandler | null | undefined;

export class AuraRouterNotFoundController {
  private instanceHandler?: NotFoundHandler | null;
  private notFoundOutlet?: AuraRouterOutlet;
  private readonly router: AuraRouterNotFoundHost;

  constructor(router: AuraRouterNotFoundHost) {
    this.router = router;
  }

  static configure(handler: NotFoundHandler | null | undefined): void {
    configuredNotFoundHandler = handler ?? null;
  }

  /** Dispatches `not-found` (cancelable). Returns false when defaultPrevented. */
  static emit(router: HTMLElement, url: string, source: NotFoundSource): boolean {
    return dispatchCustomEvent(router, AURA_ROUTER_NOT_FOUND, {
      detail: { url, router, source },
    });
  }

  setHandler(handler: NotFoundHandler | null): void {
    this.instanceHandler = handler;
  }

  reset(): void {
    this.notFoundOutlet = undefined;
  }

  /** Скрывает fallback outlet (не используется при declarative `path="*"`). */
  hide(): void {
    if (!this.notFoundOutlet) return;
    this.notFoundOutlet.hidden = true;
    this.notFoundOutlet.clear();
  }

  /** Thin fallback: когда в registry нет `<aura-route path="*">`. */
  handle(url: string): void {
    if (!AuraRouterNotFoundController.emit(this.router, url, 'fallback')) return;

    const handler = this.instanceHandler ?? configuredNotFoundHandler;
    if (handler) {
      handler(url, this.router);
      return;
    }

    if (this.router.notFoundTemplate) {
      this.renderTemplate(this.router.notFoundTemplate, url);
      return;
    }

    this.renderFallback(url);
  }

  private getNotFoundOutlet(): AuraRouterOutlet {
    if (this.notFoundOutlet) return this.notFoundOutlet;
    const existing = this.router.querySelector<AuraRouterOutlet>(AuraRouterOutlet.is);
    if (existing) {
      this.notFoundOutlet = existing;
      return existing;
    }
    const outlet = document.createElement(AuraRouterOutlet.is) as AuraRouterOutlet;
    outlet.hidden = true;
    this.router.appendChild(outlet);
    this.notFoundOutlet = outlet;
    return outlet;
  }

  private renderTemplate(templateId: string, url: string): void {
    const outlet = this.getNotFoundOutlet();
    outlet.hidden = false;
    outlet.removeAttribute('template');
    outlet.template = templateId;
    this.applyNotFoundUrl(outlet, url);
  }

  private renderFallback(url: string): void {
    const outlet = this.getNotFoundOutlet();
    outlet.hidden = false;
    outlet.removeAttribute('template');
    outlet.replaceChildren(document.createTextNode(`Page not found: ${url}`));
  }

  /** Только fallback outlet — `[data-not-found-url]` не часть AURARoute. */
  private applyNotFoundUrl(root: ParentNode, url: string): void {
    root.querySelectorAll('[data-not-found-url]').forEach((el) => {
      el.textContent = url;
    });
  }
}

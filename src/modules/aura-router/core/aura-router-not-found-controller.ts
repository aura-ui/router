import type { NotFoundHandler } from '../../aura-routing-engine/core/aura-routing-engine';
import { AuraRouterOutlet } from '../../aura-router-outlet/core';
import { dispatchCustomEvent } from '../../aura-utils/misc';
import type { AuraRouter } from './aura-router';

export const AURA_ROUTER_NOT_FOUND = 'not-found';

export interface AuraRouterNotFoundHost extends HTMLElement {
  notFoundTemplate: string;
}

let configuredNotFoundHandler: NotFoundHandler | null | undefined;

export class AuraRouterNotFoundController {
  private instanceHandler?: NotFoundHandler | null;
  private notFoundOutlet?: AuraRouterOutlet;

  constructor(private readonly router: AuraRouterNotFoundHost) {}

  static configure(handler: NotFoundHandler | null | undefined): void {
    configuredNotFoundHandler = handler ?? null;
  }

  setHandler(handler: NotFoundHandler | null): void {
    this.instanceHandler = handler;
  }

  reset(): void {
    this.notFoundOutlet = undefined;
  }

  /** Вызывать при успешном match — скрывает 404. */
  hide(): void {
    if (!this.notFoundOutlet) return;
    this.notFoundOutlet.hidden = true;
    this.notFoundOutlet.clear();
  }

  handle(url: string): void {
    console.log('handel no found');

    const allowed = dispatchCustomEvent(this.router, AURA_ROUTER_NOT_FOUND, {
      detail: { url, router: this.router },
    });
    if (!allowed) return;
    console.log('handel no found1');
    const handler = this.instanceHandler ?? configuredNotFoundHandler;
    if (handler) {
      handler(url, this.router as AuraRouter);
      return;
    }
    console.log('handel no found2');
    if (this.router.notFoundTemplate) {
      this.renderTemplate(this.router.notFoundTemplate, url);
      return;
    }
    console.log('handel no found3');
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
   console.log('renderTemplate');
    const outlet = this.getNotFoundOutlet();
    outlet.hidden = false;
    outlet.template = templateId;
    console.log(templateId);
    console.log(outlet);
    outlet.querySelectorAll('[data-not-found-url]').forEach((el) => {
      el.textContent = url;
    });
  }

  private renderFallback(url: string): void {
    const outlet = this.getNotFoundOutlet();
    outlet.hidden = false;
    outlet.removeAttribute('template');
    outlet.replaceChildren(document.createTextNode(`Page not found: ${url}`));
  }
}

import { AuraOutlet, type ViewHandle } from '../../aura-outlet/core/aura-outlet';
import { getTemplate } from '../../aura-utils/misc';

import type { NotFoundHandler } from './navigation-events';

const NOT_FOUND_VIEW_KEY = '__not-found__';

export interface AuraRouterNotFoundHost extends HTMLElement {
  notFoundTemplate: string;
  appOutlet: AuraOutlet;
}

let configuredHandler: NotFoundHandler | null = null;

export class AuraRouterNotFoundController {
  private handler: NotFoundHandler | null = null;
  private viewHandle?: ViewHandle;
  private readonly router: AuraRouterNotFoundHost;

  constructor(router: AuraRouterNotFoundHost) {
    this.router = router;
  }

  static configure(handler: NotFoundHandler | null | undefined): void {
    configuredHandler = handler ?? null;
  }

  setHandler(handler: NotFoundHandler | null): void {
    this.handler = handler;
  }

  /** Drop mounted fallback view (disconnect / successful commit / committed error). */
  clear(): void {
    this.viewHandle?.destroy();
    this.viewHandle = undefined;
  }

  /** Fallback recovery UI after cancelable `not-found` (unless preventDefault). */
  recover(url: string): void {
    const handler = this.handler ?? configuredHandler;
    if (handler) {
      this.clear();
      handler(url, this.router);
      return;
    }

    const content = this.router.notFoundTemplate
      ? getTemplate(this.router.notFoundTemplate)
      : `Page not found: ${url}`;

    this.clear();
    const outlet = this.router.appOutlet;
    this.viewHandle =
      outlet.apply(content, { strategy: 'replace', key: NOT_FOUND_VIEW_KEY }) ?? undefined;

    const root = this.viewHandle?.viewRoot ?? outlet;
    root.querySelectorAll('[data-not-found-url]').forEach((el) => {
      el.textContent = url;
    });
  }
}

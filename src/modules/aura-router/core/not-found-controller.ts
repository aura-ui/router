import { AuraOutlet } from '../../aura-outlet/core/aura-outlet';
import { getTemplate } from '../../aura-utils/misc';
import type { ViewHandle } from '../../aura-outlet/core/aura-outlet';
import type { NotFoundHandler } from './navigation-events';

const NOT_FOUND_VIEW_KEY = '__not-found__';

export interface AuraRouterNotFoundHost extends HTMLElement {
  notFoundTemplate: string;
  appOutlet: AuraOutlet;
}

let configuredHandler: NotFoundHandler | null = null;

export class AuraRouterNotFoundController {
  private readonly router: AuraRouterNotFoundHost;
  private handler: NotFoundHandler | null = null;
  /** Built-in fallback mount — kept so {@link clear} can destroy it without touching later route views. */
  private viewHandle?: ViewHandle;

  constructor(router: AuraRouterNotFoundHost) {
    this.router = router;
  }

  static configure(handler: NotFoundHandler | null | undefined): void {
    configuredHandler = handler ?? null;
  }

  setHandler(handler: NotFoundHandler | null): void {
    this.handler = handler;
  }

  /** Fallback recovery UI after cancelable `not-found` (unless preventDefault). */
  recover(url: string): void {
    this.clear();

    const handler = this.handler ?? configuredHandler;
    if (handler) {
      handler(url, this.router);
      return;
    }

    const content = this.router.notFoundTemplate
      ? getTemplate(this.router.notFoundTemplate)
      : `Page not found: ${url}`;

    const handle = this.router.appOutlet.apply(content, { strategy: 'replace', key: NOT_FOUND_VIEW_KEY });
    if (!handle) return;

    this.viewHandle = handle;
    handle.viewRoot.querySelectorAll('[data-not-found-url]').forEach((el) => {
      el.textContent = url;
    });
  }

  /** Drop mounted fallback view (disconnect / successful commit / committed error). */
  clear(): void {
    this.viewHandle?.destroy();
    this.viewHandle = undefined;
  }
}

import type { NotFoundHandler, NotFoundSource } from './aura-router-not-found.types';
import { AURA_ROUTER_NOT_FOUND } from './aura-router-not-found.types';
import { AuraOutlet, type ViewHandle } from '../../aura-outlet/core/aura-outlet';
import { dispatchCustomEvent, getTemplate } from '../../aura-utils/misc';

export { AURA_ROUTER_NOT_FOUND };

const NOT_FOUND_VIEW_KEY = '__not-found__';

export interface AuraRouterNotFoundHost extends HTMLElement {
  notFoundTemplate: string;
  appOutlet: AuraOutlet;
}

let configuredNotFoundHandler: NotFoundHandler | null | undefined;

export class AuraRouterNotFoundController {
  private instanceHandler?: NotFoundHandler | null;
  private notFoundHandle?: ViewHandle;
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
    this.clearFallbackView();
  }

  /** Clears fallback view (not used when declarative `path="*"` handles 404). */
  hide(): void {
    this.clearFallbackView();
  }

  /** Thin fallback: когда в registry нет `<aura-route path="*">`. */
  handle(url: string): void {
    if (!AuraRouterNotFoundController.emit(this.router, url, 'fallback')) return;

    const handler = this.instanceHandler ?? configuredNotFoundHandler;
    if (handler) {
      this.clearFallbackView();
      handler(url, this.router);
      return;
    }

    if (this.router.notFoundTemplate) {
      this.renderTemplate(this.router.notFoundTemplate, url);
      return;
    }

    this.renderFallback(url);
  }

  private clearFallbackView(): void {
    if (!this.notFoundHandle) return;
    this.notFoundHandle.destroy();
    this.notFoundHandle = undefined;
  }

  private getAppOutlet(): AuraOutlet {
    const outlet = this.router.appOutlet;
    if (!outlet) {
      throw new Error('`<aura-router>` requires a root `<aura-outlet>` for fallback 404.');
    }
    return outlet;
  }

  private mountFallback(content: DocumentFragment | string, url?: string): void {
    const outlet = this.getAppOutlet();
    this.clearFallbackView();
    this.notFoundHandle = outlet.apply(content, {
      strategy: 'replace',
      key: NOT_FOUND_VIEW_KEY,
    }) ?? undefined;
    if (url !== undefined) {
      this.applyNotFoundUrl(this.notFoundHandle?.viewRoot ?? outlet, url);
    }
  }

  private renderTemplate(templateId: string, url: string): void {
    this.mountFallback(getTemplate(templateId), url);
  }

  private renderFallback(url: string): void {
    this.mountFallback(`Page not found: ${url}`);
  }

  /** Fallback view only — `[data-not-found-url]` is not part of AuraRoute. */
  private applyNotFoundUrl(root: ParentNode, url: string): void {
    root.querySelectorAll('[data-not-found-url]').forEach((el) => {
      el.textContent = url;
    });
  }
}

import { bind } from '../../../aura-utils/decorators/bind';
import { ENGINE_DEFAULTS } from '../aura-routing-engine-config';
import type { NavigationHandler } from '../history/provider.types';

import { findRouterLink, resolveLinkHref } from './link-resolve';

export interface LinkNavigationTrackerConfig {
  linksSelector?: string;
}

/** Click on `[data-router-link]` → navigation request. */
export class LinkNavigationTracker {
  private handler?: NavigationHandler;
  private listening = false;
  private readonly linksSelector: string;

  constructor(config: LinkNavigationTrackerConfig = {}) {
    this.linksSelector = config.linksSelector ?? ENGINE_DEFAULTS.linksSelector;
  }

  onNavigation(handler: NavigationHandler): void {
    this.handler = handler;
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;
    document.addEventListener('click', this.onDocumentClick, { capture: true });
  }

  destroy(): void {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('click', this.onDocumentClick, { capture: true });
    this.handler = undefined;
  }

  @bind
  private onDocumentClick(event: MouseEvent): void {
    const anchor = findRouterLink(event.target, this.linksSelector);
    if (!anchor) return;

    const href = resolveLinkHref(anchor);
    if (!href) return;

    event.preventDefault();
    this.handler?.({ href, action: 'push', replace: false, syncHistory: true });
  }
}

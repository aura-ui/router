import { bind } from '../../../aura-utils/decorators/bind';
import { ENGINE_DEFAULTS } from '../aura-routing-engine-config';
import type { NavigationHandler } from '../history/provider.types';

import { findRouterLink, resolveLinkHref } from './link-resolve';

export interface LinkNavigationTrackerConfig {
  linksSelector?: string;
}

/**
 * True when the router should own the click (plain primary click, same tab).
 * Modifier keys, non-primary button, `download`, and non-`_self` targets stay with the browser.
 */
function shouldHandleLinkClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.hasAttribute('download')) return false;
  // DOM `target` is "" when unset (same as _self).
  if (anchor.target && anchor.target.toLowerCase() !== '_self') return false;
  return true;
}

/** Click on `[data-aura-link]` → navigation request. */
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

  /** Pause click capture; keeps {@link onNavigation} handler for a later {@link start}. */
  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('click', this.onDocumentClick, { capture: true });
  }

  destroy(): void {
    this.stop();
    this.handler = undefined;
  }

  @bind
  private onDocumentClick(event: MouseEvent): void {
    const anchor = findRouterLink(event.target, this.linksSelector);
    if (!anchor || !shouldHandleLinkClick(event, anchor)) return;

    const href = resolveLinkHref(anchor);
    if (!href) return;

    event.preventDefault();
    this.handler?.({ href, action: 'push', replace: false, syncHistory: true });
  }
}

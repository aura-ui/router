import { bind } from '../../../aura-utils/decorators/bind';
import type { PrefetchMode } from '../prefetch/types';

import { findRouterLink, readLinkHref, resolveLinkPrefetchMode } from './router-link';

export type LinkPrefetchHandlers = {
  scheduleIntent(href: string, mode?: PrefetchMode): void;
  cancelIntent(href?: string): void;
};

export type LinkPrefetchIntentOptions = {
  defaultMode?: PrefetchMode;
};

export interface LinkPrefetchIntentTrackerConfig {
  linksSelector?: string;
}

/** Hover / focus / touch на in-app ссылках → prefetch intent. */
export class LinkPrefetchIntentTracker {
  private handlers?: LinkPrefetchHandlers;
  private listening = false;
  private readonly linksSelector: string;
  private defaultMode: PrefetchMode = 'intent';

  constructor(config: LinkPrefetchIntentTrackerConfig = {}) {
    this.linksSelector = config.linksSelector ?? '[data-router-link]';
  }

  setHandlers(handlers: LinkPrefetchHandlers, options: LinkPrefetchIntentOptions = {}): void {
    this.handlers = handlers;
    this.defaultMode = options.defaultMode ?? 'intent';
  }

  start(): void {
    if (this.listening || !this.handlers) return;
    this.listening = true;
    document.addEventListener('mouseover', this.onLinkIntent, { capture: true });
    document.addEventListener('mouseout', this.onLinkLeave, { capture: true });
    document.addEventListener('focusin', this.onLinkIntent, { capture: true });
    document.addEventListener('focusout', this.onLinkLeave, { capture: true });
    document.addEventListener('touchstart', this.onLinkTouch, { capture: true, passive: true });
  }

  destroy(): void {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('mouseover', this.onLinkIntent, { capture: true });
    document.removeEventListener('mouseout', this.onLinkLeave, { capture: true });
    document.removeEventListener('focusin', this.onLinkIntent, { capture: true });
    document.removeEventListener('focusout', this.onLinkLeave, { capture: true });
    document.removeEventListener('touchstart', this.onLinkTouch, { capture: true });
    this.handlers?.cancelIntent();
    this.handlers = undefined;
  }

  @bind
  private onLinkIntent(event: Event): void {
    if (!this.handlers) return;

    const anchor = findRouterLink(event.target, this.linksSelector);
    if (!anchor) return;

    const href = readLinkHref(anchor);
    if (!href) return;

    const mode = resolveLinkPrefetchMode(anchor, this.defaultMode);
    if (!mode) return;

    this.handlers.scheduleIntent(href, mode);
  }

  @bind
  private onLinkLeave(event: Event): void {
    if (!this.handlers) return;

    const anchor = findRouterLink(event.target, this.linksSelector);
    if (!anchor) return;

    const href = readLinkHref(anchor);
    if (!href) return;

    const related = event.relatedTarget;
    if (related instanceof Element && anchor.contains(related)) return;

    this.handlers.cancelIntent(href);
  }

  @bind
  private onLinkTouch(event: TouchEvent): void {
    if (!this.handlers) return;

    const anchor = findRouterLink(event.target, this.linksSelector);
    if (!anchor) return;

    const href = readLinkHref(anchor);
    if (!href) return;

    const attrMode = anchor.getAttribute('data-prefetch')?.trim().toLowerCase();
    const mode = attrMode === 'tap' ? 'tap' : resolveLinkPrefetchMode(anchor, 'tap');
    if (!mode) return;

    this.handlers.scheduleIntent(href, mode);
  }
}

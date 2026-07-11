import { bind } from '../../../aura-utils/decorators/bind';
import type { PrefetchMode } from '../prefetch/types';

import { findRouterLink, readRouterLinkFromEvent, resolveLinkHref } from './router-link';

export type LinkPrefetchHandlers = {
  scheduleIntent(href: string, mode?: PrefetchMode): void;
  cancelIntent(href?: string): void;
};

export type LinkPrefetchModeResolver = (
  anchor: HTMLAnchorElement,
  href: string,
  touch: boolean,
) => PrefetchMode | null;

export interface LinkPrefetchIntentTrackerConfig {
  linksSelector?: string;
  handlers: LinkPrefetchHandlers;
  resolveMode: LinkPrefetchModeResolver;
}

/** Hover / focus / touch on `[data-router-link]` → prefetch intent. */
export class LinkPrefetchIntentTracker {
  private readonly handlers: LinkPrefetchHandlers;
  private listening = false;
  private readonly linksSelector: string;
  private readonly resolveMode: LinkPrefetchModeResolver;

  constructor(config: LinkPrefetchIntentTrackerConfig) {
    this.handlers = config.handlers;
    this.linksSelector = config.linksSelector ?? '[data-router-link]';
    this.resolveMode = config.resolveMode;
  }

  start(): void {
    if (this.listening) return;
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
    this.handlers.cancelIntent();
  }

  @bind
  private onLinkIntent(event: Event): void {
    this.scheduleFromEvent(event, false);
  }

  @bind
  private onLinkLeave(event: Event): void {
    const anchor = findRouterLink(event.target, this.linksSelector);
    if (!anchor) return;

    const href = resolveLinkHref(anchor);
    if (!href) return;

    const related = 'relatedTarget' in event ? event.relatedTarget : null;
    if (related instanceof Element && anchor.contains(related)) return;

    this.handlers.cancelIntent(href);
  }

  @bind
  private onLinkTouch(event: TouchEvent): void {
    this.scheduleFromEvent(event, true);
  }

  private scheduleFromEvent(event: Event, touch: boolean): void {
    const link = readRouterLinkFromEvent(event, this.linksSelector);
    if (!link) return;

    const mode = this.resolveMode(link.anchor, link.href, touch);
    if (!mode) return;

    this.handlers.scheduleIntent(link.href, mode);
  }
}

import { bind } from '../../../aura-utils/decorators/bind';
import type { PrefetchMode } from '../prefetch/types';

import {
  findRouterLink,
  readLinkHref,
  readRouterLinkFromEvent,
  resolveLinkPrefetchMode,
  resolveLinkTouchPrefetchMode,
} from './router-link';

export type LinkPrefetchHandlers = {
  scheduleIntent(href: string, mode?: PrefetchMode): void;
  cancelIntent(href?: string): void;
};

export interface LinkPrefetchIntentTrackerConfig {
  linksSelector?: string;
  handlers: LinkPrefetchHandlers;
  defaultMode?: PrefetchMode;
}

/** Hover / focus / touch на in-app ссылках → prefetch intent. */
export class LinkPrefetchIntentTracker {
  private readonly handlers: LinkPrefetchHandlers;
  private listening = false;
  private readonly linksSelector: string;
  private readonly defaultMode: PrefetchMode;

  constructor(config: LinkPrefetchIntentTrackerConfig) {
    this.handlers = config.handlers;
    this.linksSelector = config.linksSelector ?? '[data-router-link]';
    this.defaultMode = config.defaultMode ?? 'intent';
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
    const link = readRouterLinkFromEvent(event, this.linksSelector);
    if (!link) return;

    const mode = resolveLinkPrefetchMode(link.anchor, this.defaultMode);
    if (!mode) return;

    this.handlers.scheduleIntent(link.href, mode);
  }

  @bind
  private onLinkLeave(event: Event): void {
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
    const link = readRouterLinkFromEvent(event, this.linksSelector);
    if (!link) return;

    const mode = resolveLinkTouchPrefetchMode(link.anchor);
    if (!mode) return;

    this.handlers.scheduleIntent(link.href, mode);
  }
}

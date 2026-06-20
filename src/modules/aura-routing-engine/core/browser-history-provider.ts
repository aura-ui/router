import { bind } from '../../aura-utils/misc/bind';

import type {
  NavigationHandler,
  NavigationProvider,
  NavigateHistoryOptions,
} from './navigation-provider.types';

export interface BrowserHistoryProviderConfig {
  linksSelector?: string;
}

/** History API + popstate + перехват in-app ссылок. */
export class BrowserHistoryProvider implements NavigationProvider {
  private handler?: NavigationHandler;
  private listening = false;
  private readonly linksSelector: string;

  constructor(config: BrowserHistoryProviderConfig = {}) {
    this.linksSelector = config.linksSelector ?? '[data-router-link]';
  }

  get currentHref(): string {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  onNavigation(handler: NavigationHandler): void {
    this.handler = handler;
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('popstate', this.onPopState);
    document.addEventListener('click', this.onDocumentClick, { capture: true });
  }

  destroy(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('popstate', this.onPopState);
    document.removeEventListener('click', this.onDocumentClick, { capture: true });
    this.handler = undefined;
  }

  commit(url: string, options: NavigateHistoryOptions): void {
    if (!options.syncHistory) return;

    if (options.replace) {
      history.replaceState(null, '', url);
    } else {
      history.pushState(null, '', url);
    }
  }

  rollback(url: string): void {
    history.replaceState(null, '', url);
  }

  @bind
  private onPopState(): void {
    this.handler?.({
      href: this.currentHref,
      action: 'pop',
      replace: true,
      syncHistory: false,
    });
  }

  @bind
  private onDocumentClick(event: MouseEvent): void {
    const { target } = event;
    if (!(target instanceof Element)) return;

    const anchor = target.closest('a');
    if (!anchor || !anchor.matches(this.linksSelector)) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) {
      return;
    }

    event.preventDefault();
    this.handler?.({
      href,
      action: 'push',
      replace: false,
      syncHistory: true,
    });
  }
}

import { bind } from '../../../aura-utils/decorators/bind';
import { getCurrentAppHref } from '../link-active/app-href';

import type {
  NavigationHandler,
  NavigationProvider,
  NavigateHistoryOptions,
} from './provider.types';

/** History API + popstate. Клики и prefetch intent — в `user-actions/`. */
export class BrowserHistoryProvider implements NavigationProvider {
  private handler?: NavigationHandler;
  private listening = false;

  get currentHref(): string {
    return getCurrentAppHref();
  }

  onNavigation(handler: NavigationHandler): void {
    this.handler = handler;
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('popstate', this.onPopState);
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('popstate', this.onPopState);
  }

  destroy(): void {
    this.stop();
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
}

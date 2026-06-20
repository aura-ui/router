import { bind } from '../../aura-utils/misc/bind';


/**
 * Способ инициации навигации.
 *
 * - `push` / `replace` — программный или клик по ссылке; URL меняет engine после успешного commit.
 * - `pop` — Back/Forward; URL уже изменён браузером до вызова processor (см. {@link AuraRoutingEngine.navigateTo}).
 * - `system` — начальная загрузка / `start()`; URL в адресной строке уже актуален.
 */
export type HistoryAction = 'push' | 'replace' | 'pop' | 'system';

export interface NavigateHistoryOptions {
  replace: boolean;
  syncHistory: boolean;
}

export interface HistoryNavigatorConfig {
  /** Вызывается при popstate (Back/Forward). URL уже изменён браузером. */
  onPopNavigate: (href: string) => void;
}

/**
 * Только History API и popstate.
 * Клики по ссылкам и scroll к #hash — не здесь.
 */
export class AuraRoutingHistoryNavigator {
  private readonly config: HistoryNavigatorConfig;
  private listening = false;

  constructor(config: HistoryNavigatorConfig) {
    this.config = config;
  }

  get isListening(): boolean {
    return this.listening;
  }

  /** pathname + search + hash из адресной строки. */
  get currentHref(): string {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  listen(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('popstate', this.onPopState);
  }

  unlisten(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('popstate', this.onPopState);
  }

  /**
   * Записать URL после успешного commit transition.
   * Вызывать только когда processor вернул `committed`.
   */
  commit(url: string, options: NavigateHistoryOptions): void {
    if (!options.syncHistory) return;

    if (options.replace) {
      history.replaceState(null, '', url);
    } else {
      history.pushState(null, '', url);
    }
  }

  /**
   * Откат URL при отменённом pop-переходе.
   * Браузер уже успел сменить адрес до popstate.
   */
  rollback(url: string): void {
    history.replaceState(null, '', url);
  }

  @bind
  private onPopState(): void {
    this.config.onPopNavigate(this.currentHref);
  }
}
/**
 * Способ инициации навигации.
 *
 * - `push` / `replace` — программный переход или клик; URL меняет engine после commit.
 * - `pop` — Back/Forward; URL уже изменён до вызова processor.
 * - `system` — начальная загрузка / `start()`; URL уже актуален.
 */
export type HistoryAction = 'push' | 'replace' | 'pop' | 'system';

export interface NavigateHistoryOptions {
  replace: boolean;
  syncHistory: boolean;
}

/** Запрос на переход — engine делает match → processor → commit/rollback. */
export interface NavigationRequest {
  href: string;
  action: HistoryAction;
  replace: boolean;
  syncHistory: boolean;
}

export type NavigationHandler = (request: NavigationRequest) => void;

/**
 * Источник навигации: history, popstate, клики по in-app ссылкам.
 * Не знает про routes, guards и render — только URL и события.
 */
export interface NavigationProvider {
  readonly currentHref: string;

  onNavigation(handler: NavigationHandler): void;
  start(): void;
  destroy(): void;

  /** Записать URL после успешного commit transition. */
  commit(url: string, options: NavigateHistoryOptions): void;

  /** Откат URL при отменённом pop-переходе. */
  rollback(url: string): void;
}

/**
 * Способ инициации навигации.
 *
 * - `push` / `replace` — программный переход или клик; URL меняет engine после **history commit**.
 * - `pop` — Back/Forward; URL уже изменён до вызова processor.
 * - `system` — начальная загрузка / `start()`; URL уже актуален.
 */
export type HistoryAction = 'push' | 'replace' | 'pop' | 'system';

export interface NavigateHistoryOptions {
  replace: boolean;
  syncHistory: boolean;
}

/** Запрос на переход — engine делает match → processor → history commit / rollback. */
export interface NavigationRequest {
  href: string;
  action: HistoryAction;
  replace: boolean;
  syncHistory: boolean;
}

export type NavigationHandler = (request: NavigationRequest) => void;

/**
 * History transport: popstate, commit, rollback.
 * Клики по in-app ссылкам — `user-actions/LinkNavigationTracker`.
 */
export interface NavigationProvider {
  readonly currentHref: string;

  onNavigation(handler: NavigationHandler): void;
  start(): void;
  destroy(): void;

  /** History commit: записать URL после успешного processor (не view commit / render). */
  commit(url: string, options: NavigateHistoryOptions): void;

  /** Откат URL при отменённом pop-переходе. */
  rollback(url: string): void;
}

// 1. передаем роуты, запоминаем их
// 2. делаем механизм прослушивания кликов по документу и popstate
// 3. когда отловленно событие spa перехода - выбираем самый подходящий патерн соответствующий href
// 4. вызываем следующий слой обработчика (processor) - передаем в него from и to (этот слой будет запускать все необходимык фазы для ротеру)
// 5. если фазы благополучно прошли - нам необходимо поменять урл (атомарность перехода)

import type { AURARoute } from '../../aura-route/core/aura-route';
import { bind } from '../../aura-utils/misc/bind';
import { parsePath } from '../../aura-utils/misc/url';
import { AuraRoutingHistoryNavigator, type HistoryAction, type NavigateHistoryOptions } from './aura-routing-history-navigator';
import type { AuraRoutingProcessor } from './aura-routing-processor';
import type { TransactionResult } from './aura-routing-phase-executor';
import { AuraRoutingRouteRegistry } from './aura-routing-route-regestry';
import { AuraRoutingUrlMatcher, type MatchedRouteInfo } from './aura-routing-url-matcher';

export type { MatchedRouteInfo };

export class AuraRoutingEngine {
  private readonly registry = new AuraRoutingRouteRegistry();
  private readonly matcher = new AuraRoutingUrlMatcher();
  private readonly navigator: AuraRoutingHistoryNavigator;
  private readonly config: any;

  //private routes = new Map<string, AURARoute>();
  public isRunning = false;
  private processor: AuraRoutingProcessor;
  private prev: MatchedRouteInfo | null;

  private notFoundHandler: Function | null;

  //DI
  constructor(processor: AuraRoutingProcessor, config: any = {}) {
    this.processor = processor;
    this.config = config;

    this.navigator = new AuraRoutingHistoryNavigator({
      onPopNavigate: (href) => {
        void this.navigateTo(href, 'pop', { replace: true, syncHistory: false });
      },
    });
  }

  registerRoutes(routes: Parameters<AuraRoutingRouteRegistry['register']>[0]) {
    this.registry.register(routes);
  }

  replaceRoutes(routes: Parameters<AuraRoutingRouteRegistry['replace']>[0]) {
    this.registry.replace(routes);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.navigator.listen();

    document.addEventListener('click', this.onDocumentClick, { capture: true });

    void this.navigateTo(this.navigator.currentHref, 'system', {
      replace: true,
      syncHistory: false,
    });
  }

  stop() {
    this.isRunning = false;
    this.processor.stop();
    this.navigator.unlisten();
    document.removeEventListener('click', this.onDocumentClick, { capture: true });
  }

  destroy(): void {
    this.stop();
    this.registry.clear();
    this.prev = null;
  }

  @bind
  protected onDocumentClick(event: MouseEvent) {
    const { target } = event;
    if (!(target instanceof Element)) return;

    const selector = this.config?.linksSelector ?? '[data-router-link]';
    const anchor = target.closest('a');
    if (!anchor || !anchor.matches(selector)) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;

    event.preventDefault();
    void this.navigateTo(href, 'push', { replace: false, syncHistory: true });
  }

  /**
   * Центральный метод навигации: match → processor → commit URL и состояния.
   *
   * **Порядок commit URL (атомарность перехода):**
   * 1. `processor.run({ from, to, intent })` — guards, load, render.
   * 2. При `ok` и `syncHistory: true` — `pushState` / `replaceState`.
   * 3. Обновление `prevMatchedRouteInfo`.
   *
   * **Отмена при `push` / `replace`:** URL ещё не менялся — engine просто выходит.
   * Откат history не нужен.
   *
   * **Отмена при `pop` (Back/Forward) — особый случай:**
   * Браузер меняет адресную строку *до* `popstate`. К моменту `processor.run` `window.location`
   * уже указывает на `to`, а UI и `prevMatchedRouteInfo` могут ещё соответствовать `from`.
   *
   * Engine при `!ok` **не откатывает** history: `history.forward()` / `pushState` создают новые
   * записи в стеке и ломают ожидаемое поведение Back/Forward. Синхронизацию URL и UI должен
   * выполнить **processor / render**, в зависимости от причины отмены:
   *
   * - **Guard отменил** (например, несохранённая форма): оставить UI на `from`, вернуть URL
   *   через `replaceState(from.url)` или программный navigate с `replace: true`.
   * - **Ошибка load/render**: показать error UI, fallback или redirect; при необходимости
   *   явно выровнять URL с отображаемым состоянием.
   * - **Redirect из guard**: navigate на целевой URL (часто с `replace: true`), а не
   *   механический возврат к `from`.
   *
   * @param href — pathname + search (+ hash).
   * @param action — способ инициации; для `pop` и `system` передаётся `syncHistory: false`.
   * @param options.replace — `replaceState` вместо `pushState` (только при `syncHistory: true`).
   * @param options.syncHistory — обновлять history после успешного commit; `false` для `pop`
   *   и начальной загрузки, когда URL уже задан браузером.
   */
  public async navigateTo(
    href: string,
    action: HistoryAction,
    options: {
      replace: boolean;
      syncHistory: boolean
    }): Promise<void> {
    const { pathname, search, hash } = parsePath(href);
    const relativeUrl = pathname + search + hash;

    const current = this.navigator.currentHref;

    // Только якорь на том же route — без полного transition
    if (this.matcher.isHashOnly(relativeUrl, current)) {
      this.finalizeAnchorNavigation(relativeUrl, options, hash);
      return;
    }

    const routesPaths = this.registry.routesPath();
    const found = this.matcher.match(pathname, routesPaths);
    if (!found) {
      this.notFoundHandler?.(relativeUrl);
      return;
    }

    const route = this.registry.get(found.routePath) as AURARoute;

    const to = this.matcher.toRouteInfo(relativeUrl,  pathname,     search,
      hash, found.routePath, route, found.params);

    const from = this.prev;

    const result = await this.processor.run({ from, to, action });

    this.finalizeNavigation(result, {
      action,
      url: relativeUrl,
      options,
      from,
      to,
      hash,
    });
  }

  /**
   * Протокол commit / rollback history после processor (или hash-only).
   *
   * | action  | committed              | cancelled / error (pop)   |
   * |---------|------------------------|-------------------------|
   * | push    | pushState (syncHistory)| ничего                  |
   * | replace | replaceState           | ничего                  |
   * | pop     | prev only              | rollback(from.url)      |
   * | system  | prev only              | ничего                  |
   */
  private finalizeNavigation(
    result: TransactionResult,
    ctx: {
      action: HistoryAction;
      url: string;
      options: NavigateHistoryOptions;
      from: MatchedRouteInfo | null;
      to: MatchedRouteInfo;
      hash: string;
    },
  ): void {
    switch (result.status) {
      case 'committed':
        this.navigator.commit(ctx.url, ctx.options);
        this.prev = ctx.to;
        if (ctx.hash) this.scrollToHash(ctx.hash);
        break;

      case 'cancelled':
      case 'error':
        if (ctx.action === 'pop' && ctx.from) {
          this.navigator.rollback(ctx.from.url);
        }
        break;

      case 'redirect':
        void this.navigateTo(result.url, 'replace', {
          replace: result.replace ?? false,
          syncHistory: true,
        });
        break;
    }
  }

  /** Hash-only на том же path — без processor. */
  private finalizeAnchorNavigation(
    url: string,
    options: NavigateHistoryOptions,
    hash: string,
  ): void {
    this.navigator.commit(url, options);
    if (this.prev) this.prev.url = url;
    if (hash) this.scrollToHash(hash);
  }

  private scrollToHash(hash: string): void {
    const id = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
  }

  setNotFoundHandler(callback: Function): void {
    this.notFoundHandler = callback;
  }
}

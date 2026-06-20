// 1. передаем роуты, запоминаем их
// 2. provider слушает клики и popstate
// 3. когда отловленно событие spa перехода - выбираем самый подходящий патерн соответствующий href
// 4. вызываем processor - передаем from и to
// 5. если фазы благополучно прошли - commit URL (атомарность перехода)

import type { AURARoute } from '../../aura-route/core/aura-route';
import type { RouterInstance } from '../../aura-route-hooks/core';
import { parsePath } from '../../aura-utils/misc/url';

import type { AuraRoutingProcessor } from './aura-routing-processor';
import type { TransactionResult } from './aura-routing-phase-executor';
import { AuraRoutingRouteRegistry } from './aura-routing-route-regestry';
import {
  AuraRoutingUrlMatcher,
  type MatchedRouteInfo,
} from './aura-routing-url-matcher';
import type { TransitionPolicy } from './aura-routing-transition-policy';
import { BrowserHistoryProvider } from './providers/browser-history-provider';
import type {
  HistoryAction,
  NavigateHistoryOptions,
  NavigationProvider,
} from './navigation-provider.types';

export type { MatchedRouteInfo };
export type { HistoryAction, NavigateHistoryOptions } from './navigation-provider.types';

/** Engine fallback when match returns null (no `path="*"` route). */
export type NotFoundFallbackHandler = (url: string) => void;

export interface AuraRoutingEngineConfig {
  /** Selector for in-app links to intercept. Default: `'[data-router-link]'`. */
  linksSelector?: string;
  /** Use hash-based routing. Default: `false`. */
  hash?: boolean;
  /** `out-in` | `in-out` | `parallel`. Default: `out-in`. */
  transitionPolicy?: TransitionPolicy;
  /** Вызывается после успешного commit navigation (в т.ч. catch-all). */
  onNavigationCommitted?: (to: MatchedRouteInfo) => void;
  /** Подмена history-слоя (по умолчанию BrowserHistoryProvider). */
  provider?: NavigationProvider;
}

export class AuraRoutingEngine {
  private readonly registry = new AuraRoutingRouteRegistry();
  private readonly matcher = new AuraRoutingUrlMatcher();
  private readonly provider: NavigationProvider;
  private readonly config: AuraRoutingEngineConfig;

  public isRunning = false;
  private processor: AuraRoutingProcessor;
  private prev: MatchedRouteInfo | null;
  private readonly router: RouterInstance;

  private notFoundHandler: NotFoundFallbackHandler | null = null;

  constructor(
    processor: AuraRoutingProcessor,
    router: RouterInstance,
    config: AuraRoutingEngineConfig = {},
  ) {
    this.processor = processor;
    this.router = router;
    this.config = config;

    this.provider =
      config.provider ??
      new BrowserHistoryProvider({ linksSelector: config.linksSelector });

    this.provider.onNavigation((request) => {
      void this.navigateTo(request.href, request.action, {
        replace: request.replace,
        syncHistory: request.syncHistory,
      });
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
    this.provider.start();

    void this.navigateTo(this.provider.currentHref, 'system', {
      replace: true,
      syncHistory: false,
    });
  }

  stop() {
    this.isRunning = false;
    this.processor.stop();
    this.provider.destroy();
  }

  destroy(): void {
    this.stop();
    this.registry.clear();
    this.prev = null;
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
    options: NavigateHistoryOptions,
  ): Promise<void> {
    const { pathname, search, hash } = parsePath(href);
    const relativeUrl = pathname + search + hash;

    const current = this.provider.currentHref;

    // Только якорь на том же route — без полного transition
    if (this.matcher.isHashOnly(relativeUrl, current)) {
      this.finalizeAnchorNavigation(relativeUrl, options, hash);
      return;
    }

    const routesPaths = this.registry.routesPath();
    const found = this.matcher.match(pathname, routesPaths);
    if (!found) {
      // Fallback: нет <aura-route path="*"> — thin UI + event (см. AuraRouterNotFoundController)
      if (this.prev) {
        const m = this.prev;
        m.route.onLeft({
          phase: 'left',
          from: null,
          to: { path: m.pathname, ...(m.params && { params: m.params }), ...(m.query && { query: m.query }) },
          router: this.router,
          route: m.route,
          action,
          jobId: 0,
          signal: new AbortController().signal,
        });
      }
      this.notFoundHandler?.(relativeUrl);
      if (options.syncHistory && (action === 'push' || action === 'replace')) {
        this.provider.commit(relativeUrl, options);
      }
      this.prev = null;
      return;
    }

    const route = this.registry.get(found.routePath) as AURARoute;

    const to = this.matcher.toRouteInfo(
      relativeUrl,
      pathname,
      search,
      hash,
      found.routePath,
      route,
      found.params,
    );

    const from = this.prev;

    const result = await this.processor.run({ from, to, action, router: this.router });

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
        this.provider.commit(ctx.url, ctx.options);
        this.prev = ctx.to;
        this.config.onNavigationCommitted?.(ctx.to);
        if (ctx.hash) this.scrollToHash(ctx.hash);
        break;

      case 'cancelled':
      case 'error':
        if (ctx.action === 'pop' && ctx.from) {
          this.provider.rollback(ctx.from.url);
        }
        break;

      case 'redirect': {
        const replace = result.replace ?? ctx.action === 'pop';
        void this.navigateTo(result.url, replace ? 'replace' : 'push', {
          replace,
          syncHistory: true,
        });
        break;
      }
    }
  }

  /** Hash-only на том же path — без processor. */
  private finalizeAnchorNavigation(
    url: string,
    options: NavigateHistoryOptions,
    hash: string,
  ): void {
    this.provider.commit(url, options);
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

  setNotFoundHandler(callback: NotFoundFallbackHandler): void {
    this.notFoundHandler = callback;
  }
}

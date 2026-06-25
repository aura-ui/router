// 1. передаем роуты, запоминаем их
// 2. provider слушает клики и popstate
// 3. когда отловленно событие spa перехода - выбираем самый подходящий патерн соответствующий href
// 4. вызываем processor - передаем from и to
// 5. если фазы благополучно прошли — history commit URL (provider.commit; атомарность перехода)
import type { RouterInstance } from '../../aura-route-hooks/core';
import { parsePath } from '../../aura-utils/misc/url';

import type { AuraRoutingProcessor } from './processor/processor';
import type { TransactionResult } from './processor/processor-pipeline';
import { AuraRoutingRouteRegistry } from './aura-routing-route-registry';
import {
  AuraRoutingUrlMatcher,
  type MatchedRouteInfo,
} from './match/url-matcher';
import { getLeafMatch, syncChainHref } from './route-tree';
import type { TransitionPolicy } from './transition/policy';
import {
  BrowserHistoryProvider,
  type HistoryAction,
  type NavigateHistoryOptions,
  type NavigationProvider,
} from './history';
import type { NavigationErrorDetail } from './processor/navigation-error.types';

/** Engine fallback when match returns null (no `path="*"` route). */
export type NotFoundFallbackHandler = (href: string) => void;

export interface AuraRoutingEngineConfig {
  /** Selector for in-app links to intercept. Default: `'[data-router-link]'`. */
  linksSelector?: string;
  /** Use hash-based routing. Default: `false`. */
  hash?: boolean;
  /** `out-in` | `in-out` | `parallel`. Default: `parallel`. */
  transitionPolicy?: TransitionPolicy;
  /** Вызывается после history commit navigation (в т.ч. catch-all). */
  onNavigationCommitted?: (to: MatchedRouteInfo) => void;
  /** Вызывается при любой ошибке navigation transaction. */
  onNavigationError?: (detail: NavigationErrorDetail) => void;
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
    this.processor.invalidate();
    this.provider.destroy();
  }

  destroy(): void {
    this.stop();
    this.registry.clear();
    this.prev = null;
  }

  /**
   * Центральный метод навигации: match → processor (view commit внутри) → history commit URL.
   *
   * **Порядок history commit (атомарность перехода):**
   * 1. `processor.run({ from, to, action })` — guards, load, view commit (`runRender`), effects.
   * 2. При `status: 'viewCommitted'` и `syncHistory: true` — `provider.commit()` (`pushState` / `replaceState`).
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
   *   через `replaceState(from.href)` или программный navigate с `replace: true`.
   * - **Ошибка load/render**: показать error UI, fallback или redirect; при необходимости
   *   явно выровнять URL с отображаемым состоянием.
   * - **Redirect из guard**: navigate на целевой URL (часто с `replace: true`), а не
   *   механический возврат к `from`.
   *
   * @param href — pathname + search (+ hash).
   * @param action — способ инициации; для `pop` и `system` передаётся `syncHistory: false`.
   * @param options.replace — `replaceState` вместо `pushState` (только при `syncHistory: true`).
   * @param options.syncHistory — history commit после успешного processor; `false` для `pop`
   *   и начальной загрузки, когда URL уже задан браузером.
   */
  public async navigateTo(
    href: string,
    action: HistoryAction,
    options: NavigateHistoryOptions,
  ): Promise<void> {
    const { pathname, search, hash } = parsePath(href);
    const relativeHref = pathname + search + hash;

    const current = this.provider.currentHref;

    // Только якорь на том же route — без полного transition
    if (this.matcher.isHashOnly(relativeHref, current)) {
      this.finalizeAnchorNavigation(relativeHref, options, hash);
      return;
    }

    const found = this.matcher.matchPath(pathname, this.registry.getMatchableNodes());
    if (!found) {
      // Fallback: нет <aura-route path="*"> — thin UI + event (см. AuraRouterNotFoundController)
      if (this.prev) {
        const leaf = getLeafMatch(this.prev);
        leaf.route.onLeft({
          phase: 'left',
          from: null,
          to: {
            pathname: leaf.pathname,
            ...(leaf.params && { params: leaf.params }),
            ...(leaf.query && { query: leaf.query }),
          },
          router: this.router,
          route: leaf.route,
          action,
          jobId: 0,
          signal: new AbortController().signal,
        });
      }
      this.notFoundHandler?.(relativeHref);
      if (options.syncHistory && (action === 'push' || action === 'replace')) {
        this.provider.commit(relativeHref, options);
      }
      this.prev = null;
      return;
    }

    const to = this.matcher.toRouteInfo(
      relativeHref,
      pathname,
      search,
      hash,
      found.node,
      found.params,
    );

    const from = this.prev;

    const result = await this.processor.run({ from, to, action, router: this.router });

    this.finalizeNavigation(result, {
      action,
      href: relativeHref,
      options,
      from,
      to,
      hash,
    });
  }

  /**
   * History commit / rollback после processor (или hash-only navigation).
   *
   * View commit (`runRender`) уже произошёл внутри processor до `status: 'viewCommitted'`.
   *
   * | action  | viewCommitted          | cancelled / error (pop)   |
   * |---------|------------------------|-------------------------|
   * | push    | pushState (syncHistory)| ничего                  |
   * | replace | replaceState           | ничего                  |
   * | pop     | prev only              | rollback(from.href)      |
   * | system  | prev only              | ничего                  |
   */
  private finalizeNavigation(
    result: TransactionResult,
    ctx: {
      action: HistoryAction;
      href: string;
      options: NavigateHistoryOptions;
      from: MatchedRouteInfo | null;
      to: MatchedRouteInfo;
      hash: string;
    },
  ): void {
    switch (result.status) {
      case 'viewCommitted':
        this.provider.commit(ctx.href, ctx.options);
        this.prev = ctx.to;
        this.config.onNavigationCommitted?.(ctx.to);
        if (ctx.hash) this.scrollToHash(ctx.hash);
        break;

      case 'cancelled':
        if (ctx.action === 'pop' && ctx.from) {
          this.provider.rollback(ctx.from.href);
        }
        break;

      case 'error':
        this.config.onNavigationError?.({
          error: result.error,
          href: ctx.href,
          from: ctx.from,
          to: ctx.to,
          phase: result.phase,
          viewCommitted: result.viewCommitted,
        });
        if (result.viewCommitted) {
          this.provider.commit(ctx.href, ctx.options);
          this.prev = ctx.to;
        } else if (ctx.action === 'pop' && ctx.from) {
          this.provider.rollback(ctx.from.href);
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
    href: string,
    options: NavigateHistoryOptions,
    hash: string,
  ): void {
    this.provider.commit(href, options);
    if (this.prev) syncChainHref(this.prev, href, hash);
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

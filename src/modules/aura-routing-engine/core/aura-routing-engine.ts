import type { RouterInstance } from './hooks/types';
import { parsePath } from '../../aura-utils/misc/url';

import type { AuraRoutingProcessor } from './processor/processor';
import type { TransactionResult } from './navigation/transaction-result';
import { AuraRoutingRouteRegistry } from './aura-routing-route-registry';
import {
  AuraRoutingUrlMatcher,
  type MatchedRouteInfo,
} from './match/url-matcher';
import { syncChainHref } from './route-tree/matched-chain';
import { BrowserHistoryProvider } from './history/browser-provider';
import type {
  HistoryAction,
  NavigateHistoryOptions,
  NavigationProvider,
} from './history/provider.types';
import { LinkNavigationTracker } from './user-actions/link-navigation';
import type { ContentLoadService } from './content/content-load-service';
import { ContentPrefetchExecutor } from './prefetch/executors/content';
import { DataPrefetchExecutor } from './prefetch/executors/data';
import { PrefetchPipeline } from './prefetch/pipeline';
import type { PrefetchConfig, PrefetchOptions } from './prefetch/types';
import type { NavigationHookErrorDetail } from './failure/navigation-failure';
import { applyHistoryPolicy, resolveHistoryPolicy } from './history/history-policy';
import { FailedNavigation } from './failure/navigation-failure';
import { finalizeFailure, type CompleteFailureOutcome } from './failure/finalize-failure';
import { runNotFoundExitCleanup } from './failure/not-found';

/** Engine fallback recovery when match returns null (no `path="*"` route). */
export type NotFoundFallbackHandler = (href: string) => void;

export interface AuraRoutingEngineConfig {
  /** Selector for in-app links to intercept. Default: `'[data-router-link]'`. */
  linksSelector?: string;
  /** Use hash-based routing. Default: `false`. */
  hash?: boolean;
  /** Вызывается после history commit navigation (в т.ч. catch-all). */
  onNavigationCommitted?: (to: MatchedRouteInfo) => void;
  /** Matched-route navigation failure (after processor). */
  onNavigationError?: (failure: FailedNavigation) => void;
  /** Error hook (`error="…"`) threw while handling a navigation failure. */
  onNavigationHookError?: (detail: NavigationHookErrorDetail) => void;
  /**
   * No route match (`NOT_FOUND`). Return `false` to skip fallback recovery UI.
   * DOM `not-found` events are typically wired here by {@link AuraRouter}.
   */
  onNotFound?: (failure: FailedNavigation) => void | boolean;
  /** Подмена history-слоя (по умолчанию BrowserHistoryProvider). */
  provider?: NavigationProvider;
  /** Router-owned content load service (shared prefetch + render cache). */
  contentLoad?: ContentLoadService;
  /** Link-driven prefetch; `false` disables. */
  prefetch?: false | PrefetchConfig;
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
  readonly contentLoad?: ContentLoadService;
  private prefetchPipeline?: PrefetchPipeline;
  private readonly linkNavigation: LinkNavigationTracker;

  constructor(
    processor: AuraRoutingProcessor,
    router: RouterInstance,
    config: AuraRoutingEngineConfig = {},
  ) {
    this.processor = processor;
    this.router = router;
    this.config = config;
    this.contentLoad = config.contentLoad;

    this.provider = config.provider ?? new BrowserHistoryProvider();

    const onNavigation = (request: {
      href: string;
      action: HistoryAction;
      replace: boolean;
      syncHistory: boolean;
    }) => {
      void this.navigateTo(request.href, request.action, {
        replace: request.replace,
        syncHistory: request.syncHistory,
      });
    };

    this.provider.onNavigation(onNavigation);

    this.linkNavigation = new LinkNavigationTracker({
      linksSelector: config.linksSelector,
    });
    this.linkNavigation.onNavigation(onNavigation);

    this.initPrefetch(config);
  }

  preload(href: string, options?: PrefetchOptions): Promise<void> {
    return this.prefetch(href, options);
  }

  prefetch(href: string, options?: PrefetchOptions): Promise<void> {
    return this.prefetchPipeline?.prefetch(href, options) ?? Promise.resolve();
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
    this.linkNavigation.start();
    this.prefetchPipeline?.start();

    void this.navigateTo(this.provider.currentHref, 'system', {
      replace: true,
      syncHistory: false,
    });
  }

  stop() {
    this.isRunning = false;
    this.processor.invalidate();
    this.prefetchPipeline?.destroy();
    this.linkNavigation.destroy();
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
      runNotFoundExitCleanup(this.prev, action, this.router);
      this.applyFailureOutcome(
        finalizeFailure(
          FailedNavigation.notFound(relativeHref, this.prev, action),
          this.failureDeps(options),
        ),
      );
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

    const result = await this.processor.run({
      from,
      to,
      action,
      router: this.router,
      reportHookError: (hookError, parent) => {
        this.config.onNavigationHookError?.({ error: hookError, phase: 'error', parent });
      },
    });

    this.finalizeNavigation(result, {
      action,
      href: relativeHref,
      options,
      from,
      to,
      hash,
    });
  }

  private failureDeps(options: NavigateHistoryOptions) {
    return {
      options,
      provider: this.provider,
      onNavigationError: this.config.onNavigationError,
      onNotFound: this.config.onNotFound,
      notFoundHandler: this.notFoundHandler ?? undefined,
    };
  }

  private applyFailureOutcome(outcome: CompleteFailureOutcome): void {
    if (outcome.setPrev !== undefined) {
      this.prev = outcome.setPrev;
    }
  }

  /**
   * History commit / rollback после processor (или hash-only / NOT_FOUND navigation).
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
    const historyCtx = {
      href: ctx.href,
      fromHref: ctx.from?.href ?? null,
      options: ctx.options,
    };

    switch (result.status) {
      case 'viewCommitted':
        applyHistoryPolicy('commit-target', historyCtx, this.provider);
        this.prev = ctx.to;
        this.config.onNavigationCommitted?.(ctx.to);
        if (ctx.hash) this.scrollToHash(ctx.hash);
        break;

      case 'cancelled':
        applyHistoryPolicy(
          resolveHistoryPolicy(result, ctx.action, { syncHistory: ctx.options.syncHistory }),
          historyCtx,
          this.provider,
        );
        break;

      case 'error': {
        this.applyFailureOutcome(
          finalizeFailure(result.failure, this.failureDeps(ctx.options)),
        );
        break;
      }

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

  private initPrefetch(config: AuraRoutingEngineConfig): void {
    if (config.prefetch === false) return;

    const prefetchConfig: PrefetchConfig = {
      defaultMode: 'intent',
      ...config.prefetch,
      currentHref: () => this.provider.currentHref,
    };

    const executors = [];
    if (this.contentLoad) {
      executors.push(new ContentPrefetchExecutor(this.contentLoad));
    }
    executors.push(new DataPrefetchExecutor());

    this.prefetchPipeline = new PrefetchPipeline(
      {
        matcher: this.matcher,
        getMatchableNodes: () => this.registry.getMatchableNodes(),
        getRegistryGeneration: () => this.registry.generationId,
        executors,
      },
      prefetchConfig,
      { linksSelector: config.linksSelector },
    );
  }
}

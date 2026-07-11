import {
  isHashOnlyChange,
  resolveDocumentHrefParts,
  splitAppHref,
} from '../../aura-utils/misc/url';

import { AuraRoutingRouteRegistry } from './aura-routing-route-registry';
import type { ViewGraph } from './view-graph';
import {
  FailedNavigation,
  type CompleteFailureDeps,
  type NavigationHookErrorDetail,
  finalizeFailure,
} from './failure';
import { BrowserHistoryProvider } from './history/browser-provider';
import type {
  HistoryAction,
  NavigateHistoryOptions,
  NavigationProvider,
} from './history/provider.types';
import { runNotFoundExitCleanup } from './navigation/not-found-exit-cleanup';
import { resolveNavigationTarget } from './match/resolve-navigation-target';
import {
  AuraRoutingUrlMatcher,
  type MatchedRouteInfo,
} from './match/url-matcher';
import { NavigationCoordinator } from './navigation/navigation-coordinator';
import {
  applyTransactionHistory,
  finalizeNotFoundNavigation,
  type NavigationCommittedContext,
} from './navigation/navigation-finalize';
import { PrefetchPipeline } from './prefetch/pipeline';
import { PrefetchPolicy } from './prefetch/policy';
import {
  ViewPrefetchExecutor,
  DataPrefetchExecutor,
  DefaultPrefetchResourcePlanner,
  PrefetchResourceScheduler,
} from './prefetch/resources';
import type {
  PrefetchConfig,
  PrefetchOptions,
  PrefetchResourceExecutor,
} from './prefetch/types';
import type { RouterInstance } from './route/types';
import { syncChainHref } from './route-tree/matched-chain';
import { LinkNavigationTracker } from './user-actions/link-navigation';
import { defaultHookRegistry, type HookRegistry } from './hooks/registry';
import { DataGraph } from './data-graph';
import type { InvalidateScope, RouterInvalidateOptions } from './invalidate-router-cache';
import { NavigationTransaction } from './navigation/navigation-transaction';
import { isSameNavigationTarget } from './route-tree/transition-plan';
import type { TransactionResult } from './navigation/types';

/** Engine fallback recovery when match returns null (no `path="*"` route). */
export type NotFoundFallbackHandler = (href: string) => void;

export interface AuraRoutingEngineConfig {
  /** Selector for in-app links to intercept. Default: `'[data-router-link]'`. */
  linksSelector?: string;
  /** Use hash-based routing. Default: `false`. */
  hash?: boolean;
  /** После `pushState` / `replaceState` (post-guard, до load/render). */
  onNavigationHistoryCommitted?: (ctx: NavigationCommittedContext) => void;
  /** После view commit и обновления `prev` (в т.ч. catch-all). */
  onNavigationCommitted?: (ctx: NavigationCommittedContext) => void;
  /** Hash-only navigation on the same path (`/page` → `/page#tab`); history committed, no render. */
  onAnchorNavigation?: (href: string) => void;
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
  /** Router-owned view graph (shared prefetch + render cache). */
  viewGraph?: ViewGraph;
  /** Link-driven prefetch; `false` disables. */
  prefetch?: false | PrefetchConfig;
}

export class AuraRoutingEngine {
  private readonly registry = new AuraRoutingRouteRegistry();
  private readonly matcher = new AuraRoutingUrlMatcher();
  private readonly provider: NavigationProvider;
  private readonly config: AuraRoutingEngineConfig;

  public isRunning = false;
  private prev: MatchedRouteInfo | null;
  readonly router: RouterInstance;

  private notFoundHandler: NotFoundFallbackHandler | null = null;
  readonly viewGraph?: ViewGraph;
  private prefetchPipeline?: PrefetchPipeline;
  private readonly linkNavigation: LinkNavigationTracker;
  readonly hooksRegistry: HookRegistry;
  readonly dataGraph: DataGraph;

  private readonly navigationCoordinator: NavigationCoordinator;

  constructor(
    router: RouterInstance,
    config: AuraRoutingEngineConfig = {},
  ) {
    this.router = router;
    this.config = config;
    this.viewGraph = config.viewGraph;

    this.hooksRegistry = defaultHookRegistry;
    this.dataGraph = new DataGraph(this.hooksRegistry);

    this.provider = config.provider ?? new BrowserHistoryProvider();

    this.navigationCoordinator = new NavigationCoordinator(this);

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

  /**
   * Invalidates load-hook cache entries in {@link DataGraph}.
   * Returns affected entry count; `-1` when a full invalidate matched no cached entries.
   */
  invalidateData(options: RouterInvalidateOptions = {}): number {
    const count = this.dataGraph.invalidate(options);
    this.resetPrefetchRecords(options);
    return count;
  }

  /**
   * Invalidates view-loader payload cache in {@link ViewGraph}.
   * Returns affected entry count; `-1` when a full invalidate matched no cached entries.
   */
  invalidateView(options: RouterInvalidateOptions = {}): number {
    if (!this.viewGraph) return 0;

    const count = this.viewGraph.invalidate(options);
    this.resetPrefetchRecords(options);
    return count;
  }

  private resetPrefetchRecords(options: InvalidateScope): void {
    if (!this.prefetchPipeline) return;

    if (options.path) {
      this.prefetchPipeline.resetPrefetchRecords(options.path);
      return;
    }

    if (!options.key && !options.match) {
      this.prefetchPipeline.resetPrefetchRecords();
    }
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
    this.navigationCoordinator.invalidate();
    this.prefetchPipeline?.destroy();
    this.linkNavigation.destroy();
    this.provider.destroy();
    this.matcher.destroy();
  }

  destroy(): void {
    this.stop();
    this.registry.clear();
    this.prev = null;
    this.navigationCoordinator.invalidate();
  }

  /**
   * Центральный метод навигации: match → processor → finalize.
   *
   * **Порядок history commit (push/replace, `syncHistory: true`):**
   * 1. `runGuards` — leave + guard.
   * 2. `runLoads` — DataGraph / load hooks.
   * 3. `commitHistoryIfNeeded` — `pushState` / `replaceState` (до render).
   * 4. render → `commitNavigation` (prev + callbacks, без повторного pushState).
   *
   * **Отмена до load:** URL не менялся (guard cancel или load error).
   * **Отмена/error после history commit (push/replace):** URL остаётся на target, rollback не делается.
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
    const resolved = resolveDocumentHrefParts(href);

    // Только якорь на том же route — без полного transition
    if (resolved.hash && isHashOnlyChange(resolved, splitAppHref(this.provider.currentHref))) {
      this.finalizeAnchorNavigation(resolved.href, options, resolved.hash);
      return;
    }

    const target = resolveNavigationTarget(
      this.matcher,
      resolved,
      this.registry.getMatchableNodes(),
    );

    if (target.kind === 'redirect-error') {
      console.error(
        `[aura-router] Navigation redirect failed (${target.code}): ${target.href}`,
      );
      return;
    }

    if (target.kind === 'unmatched') {
      runNotFoundExitCleanup({
        from: this.prev,
        action,
        router: this.router,
      });
      const failure = FailedNavigation.notFound(resolved.href, this.prev, action);
      this.applyFinalizeEffects(
        finalizeNotFoundNavigation(
          failure,
          action,
          resolved.href,
          this.prev?.href ?? null,
          options,
          this.provider,
          this.failureDeps(),
        ),
      );
      return;
    }

    const found = target;
    const slashFix = found.href !== resolved.href;
    const historyOptions: NavigateHistoryOptions = {
      ...options,
      replace: found.viaRedirect || slashFix || options.replace,
    };

    if (slashFix && !historyOptions.syncHistory && (action === 'system' || action === 'pop')) {
      this.provider.commit(found.href, { replace: true, syncHistory: true });
    }

    const to = found.leaf;

    const from = this.prev;
    await this.navigationCoordinator.run({
      from,
      to,
      action,
      href: found.href,
      hash: found.hash,
      options: historyOptions,
    });
  }

  private failureDeps(): CompleteFailureDeps {
    return {
      onNavigationError: this.config.onNavigationError,
      onNotFound: this.config.onNotFound,
      notFoundHandler: this.notFoundHandler ?? undefined,
    };
  }

  private applyFinalizeEffects(effects: { setPrev?: MatchedRouteInfo | null }): void {
    if (effects.setPrev !== undefined) {
      this.prev = effects.setPrev;
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
    this.config.onAnchorNavigation?.(href);
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

    const prefetchPolicy = new PrefetchPolicy(prefetchConfig);
    const prefetchExecutors: PrefetchResourceExecutor[] = [
      new DataPrefetchExecutor(this.dataGraph),
    ];

    if (this.viewGraph) {
      prefetchExecutors.unshift(new ViewPrefetchExecutor(this.viewGraph));
    }

    this.prefetchPipeline = new PrefetchPipeline(
      {
        matcher: this.matcher,
        getMatchableNodes: () => this.registry.getMatchableNodes(),
        getRegistryGeneration: () => this.registry.generationId,
        planner: new DefaultPrefetchResourcePlanner(
          { view: Boolean(this.viewGraph) },
          prefetchPolicy,
        ),
        scheduler: new PrefetchResourceScheduler(prefetchExecutors),
      },
      prefetchConfig,
      { linksSelector: config.linksSelector },
    );
  }


  /** Post-load address-bar write (`pushState` / `replaceState`). Idempotent per transaction. */
  commitHistoryIfNeeded(transition: NavigationTransaction): void {
    if (transition.historyCommitted) return;

    const { from, to, href, action, hash, historyOptions } = transition;
    if (!historyOptions.syncHistory || (action !== 'push' && action !== 'replace')) return;
    if (from && isSameNavigationTarget(from, to)) return;

    applyTransactionHistory(
      { status: 'navigationSucceeded' },
      action,
      href,
      from?.href ?? null,
      historyOptions,
      this.provider,
    );

    transition.historyCommitted = true;
    this.config.onNavigationHistoryCommitted?.({ from, to, action, hash });
  }

  /** After view commit: `prev`, scroll, `onNavigationCommitted` (URL already written). */
  commitNavigation(transition: NavigationTransaction): void {
    const { from, to, action, hash } = transition;
    this.config.onNavigationCommitted?.({ from, to, action, hash });
    if (hash) this.scrollToHash?.(hash);
    this.prev = to;
  }

  applyRedirect(result: Extract<TransactionResult, { status: 'redirect' }>, tx: NavigationTransaction): void {
    // Guard redirect: history ещё не коммитили. Load redirect после commit: replace по умолчанию.
    const replace = result.replace ?? (tx.historyCommitted || tx.action === 'pop');
    void this.navigateTo(result.url, replace ? 'replace' : 'push', {
      replace,
      syncHistory: true,
    });
  }

  finalizeError(result: Extract<TransactionResult, { status: 'error' }>, tx: NavigationTransaction) {
    const outcome = finalizeFailure(result.failure, this.failureDeps());

    if (this.shouldApplyTerminalHistoryPolicy(tx)) {
      applyTransactionHistory(
        result,
        tx.action,
        tx.href,
        tx.from?.href ?? null,
        tx.historyOptions,
        this.provider,
      );
    }

    if (outcome.setPrev !== undefined) {
      this.prev = outcome.setPrev;
    }
  }

  finalizeCancelled(tx: NavigationTransaction): void {
    if (!this.shouldApplyTerminalHistoryPolicy(tx)) {
      return;
    }

    applyTransactionHistory(
      { status: 'cancelled' },
      tx.action,
      tx.href,
      tx.from?.href ?? null,
      tx.historyOptions,
      this.provider,
    );
  }

  /** Pop always; push/replace only before post-load history commit. */
  private shouldApplyTerminalHistoryPolicy(tx: NavigationTransaction): boolean {
    return !tx.historyCommitted || tx.action === 'pop';
  }

  reportNavigationHookError(hookError: unknown, parent: FailedNavigation): void {
    this.config.onNavigationHookError?.({
      error: hookError,
      phase: 'error',
      parent,
    });
  }

  /*
  applyOutcome(result: TransactionResult, tx: NavigationTransaction): void {
    switch (result?.status) {
      case undefined:
      case 'navigationSucceeded': return;
      case 'redirect': /!* navigateTo *!/ break;
      case 'cancelled': /!* history policy *!/ break;
      case 'error': /!* finalizeFailure + history + prev *!/ break;
    }
  }
*/
}

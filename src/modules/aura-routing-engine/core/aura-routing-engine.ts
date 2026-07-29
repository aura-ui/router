import { onAbort } from '../../aura-utils/async/on-abort';
import { splitAppHref } from '../../aura-utils/misc/url';
import { resolveAuraRoutingEngineConfig } from './aura-routing-engine-config';
import { AuraRoutingRouteRegistry } from './aura-routing-route-registry';
import { EventBus } from './events';
import { NavigationFailure } from './failure';
import { defaultHookRegistry } from './hooks/registry';
import { BrowserHistoryProvider } from './history/browser-provider';
import { applyTransactionHistory } from './history/history-policy';
import { isHashOnlyChange, resolveDocumentHrefParts } from './link-active/app-href';
import { AuraRoutingUrlMatcher } from './match/url-matcher';
import { NavigationCoordinator } from './navigation/navigation-coordinator';
import { applyNavigationOutcome, navigationIdentityFromTx } from './navigation/navigation-outcome';
import { NavigationPulse } from './navigation/navigation-pulse';
import { NavigationTransaction } from './navigation/navigation-transaction';
import { unmountPrevOnNotFound } from './navigation/unmount-prev-on-not-found';
import { PrefetchPipeline } from './prefetch/pipeline';
import { PrefetchPolicy } from './prefetch/policy';
import { DefaultPrefetchResourcePlanner } from './prefetch/resources';
import { ResourceGraph } from './resource-graph';
import { syncChainHref } from './route-tree/matched-chain';
import { isSameNavigationTarget } from './route-tree/transition-plan';
import { LinkNavigationTracker } from './user-actions/link-navigation';
import type { AuraRoutingEngineConfig, ResolvedAuraRoutingEngineConfig } from './aura-routing-engine-config';
import type { DataGraph } from './data-graph';
import type { HookRegistry } from './hooks/registry';
import type { HistoryAction, NavigateHistoryOptions, NavigationProvider } from './history/provider.types';
import type { InvalidateScope, RouterInvalidateOptions } from './invalidate-router-cache';
import type { MatchedRouteInfo } from './match/url-matcher';
import type { NavigationHost } from './navigation/navigation-host';
import type { PipelineStepResult, TransactionResult } from './navigation/types';
import type { PrefetchConfig, PrefetchOptions, PrefetchPlan } from './prefetch/types';
import type { RouterInstance } from './route/types';
import type { ViewGraph } from './view-graph';
import { hydrate } from './hydrate/hydrate';
import type { AuraOutlet } from '../../aura-outlet/core/aura-outlet';

export class AuraRoutingEngine implements NavigationHost {
  readonly router: RouterInstance;
  private readonly config: ResolvedAuraRoutingEngineConfig;
  private readonly provider: NavigationProvider;
  private readonly registry = new AuraRoutingRouteRegistry();
  readonly matcher = new AuraRoutingUrlMatcher();

  readonly hooksRegistry: HookRegistry;
  /** Prepare composition root — owns handoff, data, and view graphs. */
  readonly resourceGraph: ResourceGraph;
  /**
   * Sync navigation / load event stream (observability + host chrome).
   * Prefetch intents stay on {@link PrefetchIntentBus}.
   */
  readonly events = new EventBus();
  /**
   * Navigation / load bus facade — sole emit site for lifecycle events.
   * @see {@link NavigationPulse}
   */
  readonly pulse = new NavigationPulse(this.events);
  private readonly navigationCoordinator: NavigationCoordinator;
  private readonly linkNavigation: LinkNavigationTracker;
  private prefetchPipeline?: PrefetchPipeline;

  public isRunning = false;
  private prev: MatchedRouteInfo | null = null;
  /**
   * Broken SSR `[aura-router-ssr]` after hydrate structure-error.
   * Hidden for the next navigate; removed on commit, unhidden if navigate does not commit.
   */
  private brokenInitialView: HTMLElement | null = null;

  /** Facade to {@link ResourceGraph.viewGraph} (AuraRouter / branch resolve). */
  get viewGraph(): ViewGraph {
    return this.resourceGraph.viewGraph;
  }

  /** Facade to {@link ResourceGraph.dataGraph} (invalidate / tests). */
  get dataGraph(): DataGraph {
    return this.resourceGraph.dataGraph;
  }

  /** {@link NavigationHost.engine} — probe transactions and pipeline need `this`. */
  get engine(): AuraRoutingEngine {
    return this;
  }

  /**
   * Start the engine and optionally adopt SSR `[aura-router-ssr]`.
   *
   * - adopt OK → commit `prev`, return leaf
   * - structure-error → keep SSR, `prev = null`, no `initNavigate`; return leaf for chrome sync
   * - fallback / no initial view → `initNavigate` (cold CSR)
   */
  async bootstrap(initialView: HTMLElement | null, rootOutlet: AuraOutlet): Promise<MatchedRouteInfo | null> {
    this.start();
    this.brokenInitialView = null;

    if (!initialView) {
      this.initNavigate();
      return null;
    }

    const result = await hydrate(initialView, this, rootOutlet);

    if (result.status === 'adopted') {
      this.prev = result.leaf;
      return result.leaf;
    }

    if (result.status === 'structure-error') {
      this.brokenInitialView = initialView;
      this.prev = null;
      return result.leaf;
    }

    this.initNavigate();
    return null;
  }

  constructor(router: RouterInstance, config: AuraRoutingEngineConfig = {}) {
    this.router = router;
    this.config = resolveAuraRoutingEngineConfig(config);

    this.hooksRegistry = defaultHookRegistry;

    this.resourceGraph = new ResourceGraph({
      hooks: this.hooksRegistry,
      viewGraph: this.config.viewGraph,
      viewRegistry: this.config.viewRegistry,
      viewCacheOptions: this.config.viewCache,
      dataCacheOptions: this.config.dataCache,
      sharedBufferOptions: this.config.sharedBufferOptions,
    });

    this.provider = this.config.provider ?? new BrowserHistoryProvider();

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
      linksSelector: this.config.linksSelector,
    });
    this.linkNavigation.onNavigation(onNavigation);

    this.initPrefetch();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.provider.start();
    this.linkNavigation.start();
    this.prefetchPipeline?.start();
  }

  /**
   * Pause input (history / link clicks / prefetch intents) and cancel in-flight work.
   * Keeps wiring so a later {@link start} resumes on the same instance.
   * For full teardown use {@link destroy}.
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.navigationCoordinator.invalidate();
    this.prefetchPipeline?.stop();
    this.linkNavigation.stop();
    this.provider.stop();
  }

  /**
   * Full teardown. Does not call {@link stop} — subsystem `destroy` already pauses listeners
   * where needed; calling both would re-stop / re-invalidate for nothing.
   */
  destroy(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.navigationCoordinator.invalidate();
    }
    this.prefetchPipeline?.destroy();
    this.linkNavigation.destroy();
    this.provider.destroy();
    this.matcher.destroy();
    this.registry.clear();
    this.prev = null;
    this.brokenInitialView = null;
    this.resourceGraph.destroy();
    this.events.destroy();
  }

  initNavigate() {
    void this.navigateTo(this.provider.currentHref, 'system', {
      replace: true,
      syncHistory: false,
    });
  }

  registerRoutes(routes: Parameters<AuraRoutingRouteRegistry['register']>[0]) {
    this.registry.register(routes);
  }

  replaceRoutes(routes: Parameters<AuraRoutingRouteRegistry['replace']>[0]) {
    this.registry.replace(routes);
  }

  getMatchableNodes() {
    return this.registry.getMatchableNodes();
  }

  /**
   * Центральный метод навигации: match → processor → finalize.
   *
   * **Порядок history commit (push/replace, `syncHistory: true`):**
   * 1. `runGuards` — leave + guard (после redirect collapse в coordinator).
   * 2. `commitHistoryIfNeeded` → `notifyUrlAligned` — write URL (если нужно),
   *    затем chrome sync (active links / navigation-start) до load/render.
   * 3. `runLoads` — DataGraph / load hooks.
   * 4. render → `commitNavigation` (prev + late chrome sync, без повторного pushState).
   *
   * **Отмена до history commit:** URL не менялся (guard cancel / redirect).
   * **Load/render error после history commit (push/replace):** URL остаётся на target, rollback не делается (product policy).
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
  public async navigateTo(href: string, action: HistoryAction, options: NavigateHistoryOptions): Promise<void> {
    const resolved = resolveDocumentHrefParts(href);

    // Только якорь на том же route — без полного transition
    if (resolved.hash && isHashOnlyChange(resolved, splitAppHref(this.provider.currentHref))) {
      this.finalizeHashOnlyNavigation(resolved.href, options, resolved.hash);
      return;
    }

    if (this.brokenInitialView) {
      this.brokenInitialView.hidden = true;
    }

    await this.navigationCoordinator.navigate(href, action, options);

    // Still present ⇒ navigation did not commit — undo temporary hide.
    if (this.brokenInitialView?.hidden) {
      this.brokenInitialView.hidden = false;
    }
  }

  prefetch(href: string, options?: PrefetchOptions): Promise<void> {
    return this.prefetchPipeline?.prefetch(href, options) ?? Promise.resolve();
  }

  /**
   * Invalidates a resource cache via {@link ResourceGraph}.
   * `options.cache`: `'data'` (default) | `'view'` | `'all'`.
   * Returns affected entry count; `-1` when a full invalidate matched no cached entries.
   */
  invalidate(options: RouterInvalidateOptions = {}): number {
    this.resetPrefetchRecords(options);
    if (options.cache === 'view') return this.resourceGraph.invalidateView(options);
    if (options.cache === 'all') {
      const data = this.resourceGraph.invalidateData(options);
      const view = this.resourceGraph.invalidateView(options);
      if (data < 0 && view < 0) return -1;
      return (data < 0 ? 0 : data) + (view < 0 ? 0 : view);
    }
    return this.resourceGraph.invalidateData(options);
  }

  getCommittedRoute(): MatchedRouteInfo | null {
    return this.prev;
  }

  /**
   * Terminal outcome from pre-commit redirect resolution (before pipeline run).
   * Probe txs use `id: 0` and never call {@link NavigationTransaction.run}.
   */
  finalizeResolveTerminal(result: Exclude<PipelineStepResult, null>, probe: NavigationTransaction): void {
    if (!this.isRunning) return;
    this.pulse.settle(probe.transactionId, result);
    this.applyTerminalOutcome(result, probe);
  }

  handleUnmatchedNavigation(requestedHref: string, action: HistoryAction, options: NavigateHistoryOptions): void {
    unmountPrevOnNotFound({
      from: this.prev,
      action,
      router: this.router,
    });
    this.settleAndApplyPreMatchFailure(
      NavigationFailure.notFound(requestedHref, this.prev, action),
      action,
      requestedHref,
      options,
    );
  }

  handleRedirectError(
    code: 'redirect-cycle' | 'redirect-depth-exceeded',
    href: string,
    action: HistoryAction,
    options: NavigateHistoryOptions,
  ): void {
    this.settleAndApplyPreMatchFailure(
      NavigationFailure.redirectError(code, href, this.prev, action),
      action,
      href,
      options,
    );
  }

  /** Terminal apply (history / `prev` / redirect / sharedBuffer consume). Observe via {@link NavigationPulse.settle}. */
  applyTerminalOutcome(result: TransactionResult, tx: NavigationTransaction): void {
    applyNavigationOutcome(result, navigationIdentityFromTx(tx), this.applyOutcomeContext());
    if (result.status === 'navigationSucceeded') {
      // clear buffer cache to not have a wrong expectations from users
      this.resourceGraph.consumeSharedBufferFor(tx.transitionPlan?.enterRoutes ?? []);
    }
  }

  /**
   * cancel-pending stay: pending may have written the URL and early-synced nav state.
   * Roll address bar back when needed, then ask the host to re-sync active links / branch.
   */
  restoreCommittedNavState(pending: NavigationTransaction | null): void {
    const committed = this.prev;
    if (committed == null) return;

    if (pending?.historyCommitted) {
      this.provider.rollback(committed.href);
    }
    this.pulse.restoreNavState(committed);
  }

  /**
   * Write address bar when policy requires (`push` / `replace` + `syncHistory`).
   * Call {@link notifyUrlAligned} after this. Idempotent via `historyCommitted`.
   */
  commitHistoryIfNeeded(transition: NavigationTransaction): void {
    if (transition.historyCommitted) return;

    const { from, to, href, action, historyOptions } = transition;
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
  }

  /**
   * Address bar matches navigation target (`historyCommitted` write, or `system` / `pop`).
   * Delegates to {@link NavigationPulse.alignUrl} (`navigation:url-aligned`).
   */
  notifyUrlAligned(transition: NavigationTransaction): void {
    this.pulse.alignUrl(transition);
  }

  /**
   * View promoted: {@link NavigationPulse.commitEnd} (`commit:end` + `node:activate`),
   * then update `prev` and optional hash scroll.
   */
  commitNavigation(transition: NavigationTransaction): void {
    this.pulse.commitEnd(transition);
    if (transition.hash) this.scrollToHash?.(transition.hash);
    this.prev = transition.to;
    if (this.brokenInitialView) {
      this.brokenInitialView.remove();
      this.brokenInitialView = null;
    }
  }

  reportNavigationHookError(hookError: unknown, parent: NavigationFailure): void {
    this.config.onNavigationHookError?.({
      error: hookError,
      phase: 'error',
      parent,
    });
  }

  private initPrefetch(): void {
    if (this.config.prefetch === false) return;

    const prefetchConfig: PrefetchConfig = {
      ...this.config.prefetch,
      currentHref: () => this.provider.currentHref,
    };

    const prefetchPolicy = new PrefetchPolicy(prefetchConfig);

    const runSpeculativePrepare = async (
      plan: PrefetchPlan,
      ctx: { signal: AbortSignal },
    ): Promise<void> => {
      if (ctx.signal.aborted) return;

      const probe = new NavigationTransaction(
        0,
        {
          from: this.prev,
          to: plan.leaf,
          href: plan.href,
          hash: plan.hash,
          action: 'push',
          options: { replace: false, syncHistory: false },
          phaseMode: 'prefetch',
        },
        () => ctx.signal.aborted,
        this,
      );

      const clearOnAbort = onAbort(ctx.signal, () => probe.cancel());
      try {
        await probe.runSpeculativePrepare();
      } finally {
        clearOnAbort();
      }
    };

    this.prefetchPipeline = new PrefetchPipeline(
      {
        matcher: this.matcher,
        getMatchableNodes: () => this.registry.getMatchableNodes(),
        getRegistryGeneration: () => this.registry.generationId,
        planner: new DefaultPrefetchResourcePlanner(
          { view: true },
          prefetchPolicy,
        ),
        runSpeculativePrepare,
      },
      prefetchConfig,
      { linksSelector: this.config.linksSelector },
    );
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

  /** Observe → apply for pre-match failures (`id: 0`). */
  private settleAndApplyPreMatchFailure(
    failure: NavigationFailure,
    action: HistoryAction,
    href: string,
    options: NavigateHistoryOptions,
  ): void {
    const result = failure.toResult();
    this.pulse.settle(0, result);
    applyNavigationOutcome(
      result,
      {
        action,
        href,
        fromHref: this.prev?.href ?? null,
        historyOptions: options,
      },
      this.applyOutcomeContext(),
    );
  }

  private applyOutcomeContext() {
    return {
      provider: this.provider,
      onNotFound: this.config.onNotFound,
      setPrev: (prev: MatchedRouteInfo | null) => {
        this.prev = prev;
      },
      navigateTo: (url: string, action: HistoryAction, options: NavigateHistoryOptions) => {
        void this.navigateTo(url, action, options);
      },
    };
  }

  /** Hash-only на том же path — без processor. */
  private finalizeHashOnlyNavigation(
    href: string,
    options: NavigateHistoryOptions,
    hash: string,
  ): void {
    this.provider.commit(href, options);
    if (this.prev) syncChainHref(this.prev, href, hash);
    this.config.onHashOnlyNavigation?.(href);
    if (hash) this.scrollToHash(hash);
  }

  private scrollToHash(hash: string): void {
    const id = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
  }
}

import { attr } from '../../aura-utils/decorators';
import { AURARoute, type AURARouteConfigureOptions } from '../../aura-route/core';
import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type {
  RouteHookDefinition,
  RouteInfo,
  RouteLifecycleContext,
  RouterInstance,
} from '../../aura-route-hooks/core';
import {
  RoutingEngine,
  type GuardResult,
  type NavigationContext,
  type RouteMatch,
  type RouteRegistration,
} from '../../aura-routing-engine/core';
import { NavigationJobManager } from './navigation-job';

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine!: RoutingEngine;

  private readonly jobManager = new NavigationJobManager();

  static use(hook: RouteHookDefinition, options?: Record<string, unknown>): void {
    RouteHookRegistry.register(hook, options);
  }

  static configure(options: AURARouteConfigureOptions): void {
    AURARoute.configure(options);
  }

  connectedCallback(): void {
    const routes = this.collectRoutes();
    this.setupRouting(routes);
    this.engine.setNotFoundHandler(() => {
      this.innerHTML = 'page not found';
    });
    this.engine.start();
  }

  disconnectedCallback(): void {
    this.jobManager.invalidate(); // routerGeneration++, abort job
    this.engine?.destroy();
  }

  navigate(path: string, options?: { replace?: boolean }): void {
    // intent можно передать в begin() при следующем resolveForPhase,
    // если сохранять pendingIntent на router до старта pipeline
    this.engine.navigate(path, options);
  }

  private collectRoutes(): Map<string, AURARoute> {
    const routes = new Map<string, AURARoute>();
    this.querySelectorAll<AURARoute>(AURARoute.is).forEach((route) => {
      if (!route.path) return;
      routes.set(route.path, route);
    });
    return routes;
  }

  private setupRouting(routes: Map<string, AURARoute>): void {
    this.jobManager.invalidate(); // re-connect / HMR — отрезать старые hooks
    this.engine = RoutingEngine.create('navigo', {
      root: '/',
      strategy: 'ONE',
      hash: false,
      noMatchWarning: false,
      linksSelector: this.linksSelector,
    });
    this.engine.registerAll([...routes.values()].map((route) => this.toRouteRegistration(route)));
  }

  private toRouteRegistration(route: AURARoute): RouteRegistration {
    return {
      pattern: route.path,
      render: async () => {
        const job = this.jobManager.requireActive();
        const onAbort = () => route.cancelPendingRender();
        job.signal.addEventListener('abort', onAbort, { once: true });
        try {
          await route.render();
        } finally {
          job.signal.removeEventListener('abort', onAbort);
        }
        if (job.aborted) return; // stale render — не rebindLinks и т.д.
      },
      phases: {
        enter: (ctx) => this.runEnterPhase(route, ctx),
        load: (ctx) => this.runLoadPhase(route, ctx),
        entering: (ctx) => this.runEnteringPhase(route, ctx),
        entered: (ctx) => this.runEnteredPhase(route, ctx),
        leave: (ctx) => this.runLeavePhase(route, ctx),
        leaving: (ctx) => this.runLeavingPhase(route, ctx),
        left: (ctx) => this.runLeftPhase(route, ctx),
        reentered: (ctx) => this.runReenteredPhase(route, ctx),
        error: (ctx) => this.runErrorPhase(route, ctx),
      },
    };
  }

  /** enter: route lifecycle → hooks (blocking). */
  private async runEnterPhase(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEnter(ctx);
    return this.runHooks(ctx, route.enter);
  }

  /** load: route lifecycle → hooks (blocking); failures run `error` phase. */
  private async runLoadPhase(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);

    try {
      route.onLoad(ctx);
      return await this.runHooks(ctx, route.load, { onThrow: 'error' });
    } catch (error) {
      await this.runErrorPhase(route, navCtx, error);
      return false;
    }
  }

  /** entering: route lifecycle → hooks (non-blocking, before render). */
  private async runEnteringPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEntering(ctx);
    this.warnIgnoredEffectResult(
      await this.runHooks(ctx, route.entering, { blocking: false }),
      route.path,
      'entering',
    );
  }

  /** entered: route lifecycle → hooks; redirect handled here. */
  private async runEnteredPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    const generation = this.jobManager.routerGeneration;
    const job = this.jobManager.requireActive();
    route.onEntered(ctx);
    const result = await this.runHooks(ctx, route.entered, { blocking: false });

    if (this.jobManager.isStale(job, generation)) return;

    if (typeof result === 'string') {
      this.navigate(result);
      return;
    }

    this.engine.rebindLinks();
  }

  /** leave: blocking guards only. */
  private async runLeavePhase(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    return this.runHooks(ctx, route.leave);
  }

  /** leaving: route lifecycle → hooks (non-blocking, before teardown). */
  private async runLeavingPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onLeaving(ctx);
    this.warnIgnoredEffectResult(
      await this.runHooks(ctx, route.leaving, { blocking: false }),
      route.path,
      'leaving',
    );
  }

  /** left: route teardown → hooks (non-blocking). */
  private async runLeftPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onLeft(ctx);

    this.warnIgnoredEffectResult(
      await this.runHooks(ctx, route.left, { blocking: false }),
      route.path,
      'left',
    );
  }

  /** error: route lifecycle → hooks (non-blocking, after load/render failure). */
  private async runErrorPhase(
    route: AURARoute,
    navCtx: NavigationContext,
    error?: unknown,
  ): Promise<void> {
    const failure = error ?? navCtx.error;
    const ctx = this.toLifecycleContext(route, {
      ...navCtx,
      phase: 'error',
      ...(failure !== undefined && { error: failure }),
    });
    route.onError(ctx);
    this.warnIgnoredEffectResult(
      await this.runHooks(ctx, route.error, { blocking: false }),
      route.path,
      'error',
    );
  }

  /** reentered: route lifecycle → hooks; redirect handled here. */
  private async runReenteredPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    const generation = this.jobManager.routerGeneration;
    const job = this.jobManager.requireActive();
    route.onReentered(ctx);
    const result = await this.runHooks(ctx, route.reentered, { blocking: false });

    if (this.jobManager.isStale(job, generation)) return;

    if (typeof result === 'string') {
      this.navigate(result);
      return;
    }

    this.engine.rebindLinks();
  }

  private warnIgnoredEffectResult(result: GuardResult, path: string, phase: string): void {
    if (result === false || typeof result === 'string') {
      console.warn(
        `${phase} phase hook on "${path}" returned ${result === false ? 'false' : 'redirect'} — ignored`,
      );
    }
  }

  private async runHooks(
    ctx: RouteLifecycleContext,
    hookNames: string[],
    options?: { onThrow?: 'cancel' | 'error'; blocking?: boolean },
  ): Promise<GuardResult> {
    const generation = this.jobManager.routerGeneration;
    const job = this.jobManager.requireActive();
    const isStale = () => this.jobManager.isStale(job, generation);


    try {
      if (!hookNames.length) return undefined;
      const result = await RouteHookRegistry.run(hookNames, ctx, { isStale });

      if (isStale()) {
        // blocking: enter/load/leave → cancel navigation
        // effect: entering/entered/left → тихо выйти
        return options?.blocking === false ? undefined : false;
      }
      return result;

    } catch (error) {
      if (isStale()) {
        return options?.blocking === false ? undefined : false;
      }
      console.error(error);

      if (options?.onThrow === 'error') {
        throw error;
      }

      return false;
    }
  }

  private toLifecycleContext(
    route: AURARoute,
    navCtx: NavigationContext,
  ): RouteLifecycleContext {
    const job = this.jobManager.resolveForPhase(navCtx.phase);
    return {
      phase: navCtx.phase,
      router: this,
      route,
      from: this.toRouteInfo(navCtx.from),
      to: this.toRouteInfo(navCtx.to) ?? { path: '' },
      jobId: job.id,
      signal: job.signal,
      ...(navCtx.error !== undefined && { error: navCtx.error }),
    };
  }

  private toRouteInfo(match: RouteMatch | null): RouteInfo | null {
    if (!match) return null;

    return {
      path: match.path,
      ...(match.params && { params: { ...match.params } }),
      ...(match.query && { query: { ...match.query } }),
    };
  }
}

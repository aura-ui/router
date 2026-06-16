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

export class AuraRouter extends HTMLElement implements RouterInstance {
  static is = 'aura-router';

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine!: RoutingEngine;

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
    this.engine?.destroy();
  }

  navigate(path: string): void {
    this.engine.navigate(path);
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
      render: () => route.render(),
      phases: {
        enter: (ctx) => this.runEnterPhase(route, ctx),
        load: (ctx) => this.runLoadPhase(route, ctx),
        entering: (ctx) => this.runEnteringPhase(route, ctx),
        entered: (ctx) => this.runEnteredPhase(route, ctx),
        leave: (ctx) => this.runLeavePhase(route, ctx),
        leaving: (ctx) => this.runLeavingPhase(route, ctx),
        left: (ctx) => this.runLeftPhase(route, ctx),
        reentered: (ctx) => this.runReenteredPhase(route, ctx),
      },
    };
  }

  /** enter: route lifecycle → hooks (blocking). */
  private async runEnterPhase(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEnter(ctx);
    return this.runHooks(ctx, route.enter);
  }

  /** load: route lifecycle → hooks (blocking). */
  private async runLoadPhase(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onLoad(ctx);
    return this.runHooks(ctx, route.load);
  }

  /** entering: route lifecycle → hooks (non-blocking, before render). */
  private async runEnteringPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEntering(ctx);
    this.warnIgnoredEffectResult(await this.runHooks(ctx, route.entering), route.path, 'entering');
  }

  /** entered: route lifecycle → hooks; redirect handled here. */
  private async runEnteredPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEntered(ctx);
    const result = await this.runHooks(ctx, route.entered);

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
    this.warnIgnoredEffectResult(await this.runHooks(ctx, route.leaving), route.path, 'leaving');
  }

  /** left: route teardown → hooks (non-blocking). */
  private async runLeftPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onLeft(ctx);

    this.warnIgnoredEffectResult(await this.runHooks(ctx, route.left), route.path, 'left');
  }

  /** reentered: route lifecycle → hooks; redirect handled here. */
  private async runReenteredPhase(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onReentered(ctx);
    const result = await this.runHooks(ctx, route.reentered);

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

  private async runHooks(ctx: RouteLifecycleContext, hookNames: string[]): Promise<GuardResult> {
    try {
      if (!hookNames.length) return undefined;
      return await RouteHookRegistry.run(hookNames, ctx);
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  private toLifecycleContext(route: AURARoute, navCtx: NavigationContext): RouteLifecycleContext {
    return {
      phase: navCtx.phase,
      router: this,
      route,
      from: this.toRouteInfo(navCtx.from),
      to: this.toRouteInfo(navCtx.to) ?? { path: '' },
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

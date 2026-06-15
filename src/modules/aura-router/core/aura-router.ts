import { attr } from '../../aura-utils/decorators';
import { bind } from '../../aura-utils/misc';
import { AURARoute, ROUTE_RENDERED_EVENT, type AURARouteConfigureOptions } from '../../aura-route/core';
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

export class AURARouter extends HTMLElement implements RouterInstance {
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
    this.addEventListener(ROUTE_RENDERED_EVENT, this.onRouteRendered);
  }

  disconnectedCallback(): void {
    this.engine?.destroy();
    this.removeEventListener(ROUTE_RENDERED_EVENT, this.onRouteRendered);
  }

  navigate(path: string): void {
    this.engine.navigate(path);
  }

  @bind
  protected onRouteRendered() {
    this.engine.rebindLinks();
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
        enter: (ctx) => this.runEnter(route, ctx),
        entered: (ctx) => this.runEntered(route, ctx),
        leave: (ctx) => this.runLeave(route, ctx),
        reentered: (ctx) => this.runReentered(route, ctx),
      },
    };
  }

  /** enter: route lifecycle → hooks (blocking). */
  private async runEnter(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEnter(ctx);
    return this.runHooks(ctx, route.enter);
  }

  /** entered: route lifecycle → hooks; redirect handled here. */
  private async runEntered(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEntered(ctx);
    const result = await this.runHooks(ctx, route.entered);

    if (typeof result === 'string') {
      this.navigate(result);
    }
  }

  /** reentered: route lifecycle → hooks; redirect handled here. */
  private async runReentered(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onReentered(ctx);
    const result = await this.runHooks(ctx, route.reentered);

    if (typeof result === 'string') {
      this.navigate(result);
    }
  }

  /** leave: hooks → route lifecycle (blocking). */
  private async runLeave(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    const result = await this.runHooks(ctx, route.leave);

    if (result === false || typeof result === 'string') {
      return result;
    }

    route.onLeave(ctx);
    return undefined;
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
    const from = this.toRouteInfo(navCtx.from, navCtx.phase === 'leave' ? route.path : '');
    const to = this.toRouteInfo(navCtx.to);
    const isLeavePhase = navCtx.phase === 'leave';

    return {
      phase: navCtx.phase,
      router: this,
      route,
      from: isLeavePhase ? (from ?? { path: route.path }) : from,
      to: isLeavePhase ? (to ?? { path: '' }) : to!,
    };
  }

  private toRouteInfo(match: RouteMatch | null, fallback = ''): RouteInfo | null {
    if (!match) return fallback ? { path: fallback } : null;

    return {
      path: match.path,
      ...(match.params && { params: { ...match.params } }),
      ...(match.query && { query: { ...match.query } }),
    };
  }
}

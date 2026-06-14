import RoutingEngine from 'navigo';

import { attr } from '../../aura-utils/decorators';
import { bind } from '../../aura-utils/misc';
import { AURARoute, ROUTE_RENDERED_EVENT, type AURARouteConfigureOptions } from '../../aura-route/core';
import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteHookDefinition, RouteInfo, RouteLifecycleContext, RoutePhase } from '../../aura-route-hooks/core';

type NavigoMatch = {
  url: string;
  route?: { path: string };
  data?: Record<string, string> | null;
  params?: Record<string, string> | null;
};

type NavigoArg = NavigoMatch | NavigoMatch[] | undefined;
type NavigoDone = (value?: boolean) => void;

const LIFECYCLE: Record<RoutePhase, (ctx: RouteLifecycleContext) => void> = {
  enter: (ctx) => ctx.route.onEnter(ctx),
  entered: (ctx) => ctx.route.onEntered(ctx),
  leave: (ctx) => ctx.route.onLeave(ctx),
  reentered: (ctx) => ctx.route.onReentered(ctx),
};

export class AURARouter extends HTMLElement {
  static is = 'aura-router';

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine: RoutingEngine;
  private routes = new Map<string, AURARoute>();

  static use(hook: RouteHookDefinition, options?: Record<string, unknown>): void {
    RouteHookRegistry.register(hook, options);
  }

  static configure(options: AURARouteConfigureOptions): void {
    AURARoute.configure(options);
  }

  connectedCallback(): void {
    this.collectRoutes();
    this.setupRouting();
    this.engine.notFound(() => {
      this.innerHTML = 'page not found';
    });
    this.engine.resolve();
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
    this.engine.updatePageLinks();
  }

  private collectRoutes() {
    this.routes = new Map();
    this.querySelectorAll<AURARoute>(AURARoute.is).forEach((route) => {
      if (!route.path) return;

      if (this.routes.has(route.path)) {
        console.warn(`Duplicate route path "${route.path}" — previous route will be overwritten`);
      }

      this.routes.set(route.path, route);
    });
  }

  private setupRouting(): void {
    this.engine = new RoutingEngine('/', {
      strategy: 'ONE',
      hash: false,
      noMatchWarning: false,
      linksSelector: this.linksSelector,
    });

    this.routes.forEach((route) => this.registerRoute(route));
  }

  private registerRoute(route: AURARoute): void {
    this.engine.on(route.path, (match: NavigoMatch) => route.render(match));
    this.wirePhaseHooks(route);
  }

  private wirePhaseHooks(route: AURARoute): void {
    const { path } = route;
    const ctx = (phase: RoutePhase, match: NavigoArg) =>
      this.buildLifecycleContext(route, phase, match);

    this.engine.addBeforeHook(path, (done, match) => {
      this.runLifecycleThenHooks(ctx('enter', match), done);
    });

    this.engine.addAfterHook(path, (match) => {
      this.runLifecycleThenHooks(ctx('entered', match));
    });

    this.engine.addLeaveHook(path, (done, match) => {
      this.runHooksThenLifecycle(ctx('leave', match), done);
    });

    this.engine.addAlreadyHook(path, (match) => {
      this.runLifecycleThenHooks(ctx('reentered', match));
    });
  }

  /** enter, entered, reentered: route lifecycle → registered hooks */
  private runLifecycleThenHooks(ctx: RouteLifecycleContext, done?: NavigoDone): void {
    LIFECYCLE[ctx.phase](ctx);
    void this.runHooks(ctx, done);
  }

  /** leave: registered hooks → route lifecycle (Navigo blocks navigation until done) */
  private runHooksThenLifecycle(ctx: RouteLifecycleContext, done?: NavigoDone): void {
    void this.runHooks(ctx, done, () => LIFECYCLE.leave(ctx));
  }

  private async runHooks(
    ctx: RouteLifecycleContext,
    done?: NavigoDone,
    after?: () => void,
  ): Promise<void> {
    try {
      const hookNames = ctx.route[ctx.phase];
      const result = hookNames.length
        ? await RouteHookRegistry.run(hookNames, ctx)
        : undefined;

      if (this.applyHookResult(result, done)) return;

      after?.();
      done?.();
    } catch (error) {
      console.error(error);
      done?.(false);
    }
  }

  /** true — навигация прервана (redirect или cancel) */
  private applyHookResult(result: boolean | void | string | undefined, done?: NavigoDone): boolean {
    if (typeof result === 'string') {
      this.navigate(result);
      done?.(false);
      return true;
    }

    if (result === false && done) {
      done(false);
      return true;
    }

    return false;
  }

  private buildLifecycleContext(route: AURARoute, phase: RoutePhase, match: NavigoArg): RouteLifecycleContext {
    const resolved = Array.isArray(match) ? match[0] : match ?? null;
    const to = this.toRouteInfo(resolved, route.path);
    const from = this.toRouteInfo(this.engine.lastResolved()?.[0] ?? null);
    const isLeave = phase === 'leave';

    return {
      phase,
      router: this,
      route,
      from: isLeave ? (from ?? { path: route.path }) : from,
      to: isLeave ? (to ?? { path: '' }) : to!,
    };
  }

  private toRouteInfo(match: NavigoMatch | null | undefined, fallback = ''): RouteInfo | null {
    if (!match) return fallback ? { path: fallback } : null;

    const pathParams = match.data;
    const queryParams = match.params;

    return {
      path: match.url || match.route?.path || fallback,
      ...(pathParams && { params: { ...pathParams } }),
      ...(queryParams && { query: { ...queryParams } }),
    };
  }
}

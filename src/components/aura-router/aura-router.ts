import RoutingEngine from 'navigo';
import { AURARoute, ROUTE_RENDERED_EVENT } from '../aura-route/aura-route';
import { attr } from '../../utils/decorators/attr';
import { bind } from '../../utils/misc/bind';
import { RouteHookRegistry } from './core/aura-router-hooks-manager';
import type { RouteHookDefinition, RouteInfo, RouteLifecycleContext, RoutePhase } from './plugins/types';

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
      route.path && this.routes.set(route.path, route);
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
        ? await RouteHookRegistry.run(hookNames, { ...ctx, options: {} })
        : undefined;

      if (done && (result === false || typeof result === 'string')) {
        if (typeof result === 'string') this.navigate(result);
        return done(false);
      }

      after?.();
      done?.();
    } catch (error) {
      console.error(error);
      done?.(false);
    }
  }

  private buildLifecycleContext(route: AURARoute, phase: RoutePhase, match: NavigoArg): RouteLifecycleContext {
    const target = this.resolveMatch(match, route.path);
    const from = this.toRouteInfo(this.engine.lastResolved()?.[0] ?? null);

    if (phase === 'leave') {
      return this.buildLeaveContext(route, from, target);
    }

    return { phase, router: this, route, to: target!, from };
  }

  /** Leaving route: `from` is current route, `to` is the destination being navigated to */
  private buildLeaveContext(
    route: AURARoute,
    from: RouteInfo | null,
    to: RouteInfo | null,
  ): RouteLifecycleContext {
    return {
      phase: 'leave',
      router: this,
      route,
      from: from ?? { path: route.path },
      to: to ?? { path: '' },
    };
  }

  private resolveMatch(match: NavigoArg, fallbackPath: string): RouteInfo | null {
    const resolved = Array.isArray(match) ? match[0] : match ?? null;
    return this.toRouteInfo(resolved, fallbackPath);
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

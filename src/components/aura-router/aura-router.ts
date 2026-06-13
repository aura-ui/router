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
      this.innerHTML = 'page no found';
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

    this.engine.addBeforeHook(path, (done, match) => {
      this.runPhaseTransition(this.buildLifecycleContext(route, 'enter', match), done);
    });

    this.engine.addAfterHook(path, (match) => {
      this.runPhaseTransition(this.buildLifecycleContext(route, 'entered', match));
    });

    this.engine.addLeaveHook(path, (done, match) => {
      this.runPhaseTransition(this.buildLifecycleContext(route, 'leave', match), done);
    });

    this.engine.addAlreadyHook(path, (match) => {
      this.runPhaseTransition(this.buildLifecycleContext(route, 'reentered', match));
    });
  }

  /** enter/entered/reentered: lifecycle → hooks; leave: hooks → lifecycle */
  private runPhaseTransition(ctx: RouteLifecycleContext, done?: (value?: boolean) => void): void {
    const lifecycle = () => LIFECYCLE[ctx.phase](ctx);

    if (ctx.phase === 'leave') void this.runPhase(ctx, done, lifecycle);
    else {
      lifecycle();
      void this.runPhase(ctx, done);
    }
  }

  private async runPhase(
    ctx: RouteLifecycleContext,
    done?: (value?: boolean) => void,
    after?: () => void,
  ): Promise<void> {
    try {
      const names = ctx.route[ctx.phase];
      const result = names.length
        ? await RouteHookRegistry.run(names, { ...ctx, options: {} })
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
    const from = this.toRouteInfo(this.engine.lastResolved()?.[0] ?? null);
    const target = this.toRouteInfo(Array.isArray(match) ? match[0] : match ?? null, route.path);

    if (phase === 'leave') {
      return { phase, router: this, route, from: from ?? { path: route.path }, to: target ?? { path: '' } };
    }

    return { phase, router: this, route, to: target!, from };
  }

  private toRouteInfo(match: NavigoMatch | null | undefined, fallback = ''): RouteInfo | null {
    if (!match) return fallback ? { path: fallback } : null;

    return {
      path: match.url || match.route?.path || fallback,
      ...(match.data && { params: { ...match.data } }),
      ...(match.params && { query: { ...match.params } }),
    };
  }

}

import RoutingEngine from 'navigo';
import { AURARoute, ROUTE_RENDERED_EVENT } from '../aura-route/aura-route';
import { attr } from '../../utils/decorators/attr';
import { bind } from '../../utils/misc/bind';
import { RouteHookRegistry } from './core/aura-router-hooks-manager';
import type { RouteHookContext, RouteHookDefinition, RouteInfo, RoutePhase } from './plugins/types';

type NavigoMatch = {
  url: string;
  route?: { path: string };
  data?: Record<string, string> | null;
  params?: Record<string, string> | null;
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
    const routes: NodeListOf<AURARoute> = this.querySelectorAll(AURARoute.is);
    this.routes = new Map<string, AURARoute>();
    for (const route of routes) {
      route.path && this.routes.set(route.path, route);
    }
  }

  private setupRouting(): void {
    this.engine = new RoutingEngine('/', {
      strategy: 'ONE',
      hash: false,
      noMatchWarning: false,
      linksSelector: this.linksSelector,
    });

    this.routes.forEach((route, path) => this.registerRoute(path, route));
  }

  private registerRoute(path: string, route: AURARoute): void {
    this.engine.on(path, (match: NavigoMatch) => route.render(match));

    const phases: RoutePhase[] = ['enter', 'entered', 'leave', 'reentered'];
    for (const phase of phases) this.wirePhaseHook(path, route, phase);
  }

  private wirePhaseHook(path: string, route: AURARoute, phase: RoutePhase): void {
    const names = route[phase];

    switch (phase) {
      case 'enter':
        this.engine.addBeforeHook(path, (done, match: NavigoMatch) => {
          route.onEnter();
          void this.runPhase(route, phase, names, match, done);
        });
        break;
      case 'entered':
        this.engine.addAfterHook(path, (match: NavigoMatch) => {
          route.onEntered();
          void this.runPhase(route, phase, names, match);
        });
        break;
      case 'leave':
        this.engine.addLeaveHook(path, (done, match) => {
          void this.runPhase(route, phase, names, match, done, () => route.onLeave());
        });
        break;
      case 'reentered':
        this.engine.addAlreadyHook(path, (match: NavigoMatch) => {
          route.onReentered();
          void this.runPhase(route, phase, names, match);
        });
        break;
    }
  }

  private async runPhase(
    route: AURARoute,
    phase: RoutePhase,
    names: string[],
    match: NavigoMatch | NavigoMatch[] | undefined,
    done?: (value?: boolean) => void,
    after?: () => void,
  ): Promise<void> {
    try {
      const result = names.length
        ? await RouteHookRegistry.run(names, this.buildHookContext(route, phase, match))
        : undefined;

      if (done) {
        if (result === false || typeof result === 'string') return this.resolvePhase(result, done);
        after?.();
        done();
        return;
      }

      after?.();
    } catch (error) {
      console.error(error);
      done?.(false);
    }
  }

  private resolvePhase(result: boolean | void | string, done: (value?: boolean) => void): void {
    if (result === false) return done(false);
    if (typeof result === 'string') {
      this.navigate(result);
      return done(false);
    }
    done();
  }

  private buildHookContext(
    route: AURARoute,
    phase: RoutePhase,
    match: NavigoMatch | NavigoMatch[] | undefined,
  ): RouteHookContext {
    const base = { phase, router: this, route, options: {} };
    const from = this.toRouteInfo(this.lastResolvedMatch());

    if (phase === 'leave') {
      return {
        ...base,
        from: from ?? this.toRouteInfo(undefined, route.path)!,
        to: this.toRouteInfo(this.firstMatch(match)) ?? { path: '' },
      };
    }

    return {
      ...base,
      to: this.toRouteInfo(this.firstMatch(match), route.path)!,
      from,
    };
  }

  /** Navigo.lastResolved() до updateState — предыдущий или уходящий маршрут */
  private lastResolvedMatch(): NavigoMatch | null {
    return this.engine.lastResolved()?.[0] ?? null;
  }

  private firstMatch(match: NavigoMatch | NavigoMatch[] | undefined): NavigoMatch | null {
    if (!match) return null;
    return Array.isArray(match) ? match[0] ?? null : match;
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

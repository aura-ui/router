import RoutingEngine from 'navigo';
import { AURARoute, ROUTE_RENDERED_EVENT } from '../aura-route/aura-route';
import { attr } from '../../utils/decorators/attr';
import { bind } from '../../utils/misc/bind';
import { RouteHookRegistry } from './core/aura-router-hooks-manager';
import type { RouteHookContext, RouteHookDefinition, RoutePhase } from './plugins/types';

export class AURARouter extends HTMLElement {
  static is = 'aura-router';

  @attr({ dataAttr: true, defaultValue: '[data-router-link]' }) linksSelector: string;

  private engine: RoutingEngine;
  private routes = new Map<string, AURARoute>();

  /** Глобальная регистрация — только fn + options, без ссылки на instance */
  static use(hook: RouteHookDefinition, options?: Record<string, unknown>): void {
    RouteHookRegistry.register(hook, options);
  }

  connectedCallback(): void {
    this.collectRoutes();
    this.initEngine();
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

  private initEngine(): void {
    this.engine = new RoutingEngine('/', {
      strategy: 'ONE',
      hash: false,
      noMatchWarning: false,
      linksSelector: this.linksSelector,
    });

    this.routes.forEach((route, path) => this.registerRoute(path, route));
  }

  private registerRoute(path: string, route: AURARoute): void {
    this.engine.on(path, (match) => route.render(match));

    const phases: RoutePhase[] = ['enter', 'entered', 'leave', 'reentered'];
    for (const phase of phases) {
      const names = route.getHookNames(phase);
      if (names.length) this.attachPhaseHook(path, route, phase, names);
    }
  }

  private attachPhaseHook(
    path: string,
    route: AURARoute,
    phase: RoutePhase,
    names: string[],
  ): void {
    switch (phase) {
      case 'enter':
        this.engine.addBeforeHook(path, (done) => void this.runBlockingPhase(route, phase, names, done));
        break;
      case 'entered':
        this.engine.addAfterHook(path, () => void this.runPassivePhase(route, phase, names));
        break;
      case 'leave':
        this.engine.addLeaveHook(path, (done) => void this.runBlockingPhase(route, phase, names, done));
        break;
      case 'reentered':
        this.engine.addAlreadyHook(path, () => void this.runPassivePhase(route, phase, names));
        break;
    }
  }

  private runPhaseHooks(
    route: AURARoute,
    phase: RoutePhase,
    names: string[],
  ): Promise<boolean | void | string> {
    return RouteHookRegistry.run(names, this.buildHookContext(route, phase));
  }

  private async runBlockingPhase(
    route: AURARoute,
    phase: RoutePhase,
    names: string[],
    done: (value?: boolean) => void,
  ): Promise<void> {
    this.finishBlocking(await this.runPhaseHooks(route, phase, names), done);
  }

  private async runPassivePhase(
    route: AURARoute,
    phase: RoutePhase,
    names: string[],
  ): Promise<void> {
    await this.runPhaseHooks(route, phase, names);
  }

  private finishBlocking(
    result: boolean | void | string,
    done: (value?: boolean) => void,
  ): void {
    if (result === false) return done(false);
    if (typeof result === 'string') {
      this.navigate(result);
      return done(false);
    }
    done();
  }

  private buildHookContext(route: AURARoute, phase: RoutePhase): RouteHookContext {
    return {
      phase,
      to: { path: route.path /* + params, query */ },
      from: null /* previous match */,
      router: this,
      route,
      options: {}, // merged per hook inside Registry.run()
    };
  }

}
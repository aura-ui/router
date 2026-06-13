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
    this.wirePhaseHooks();
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

    this.routes.forEach((route, path) => {
      this.engine.on(path, (match) => route.render(match));
    });
  }

  private wirePhaseHooks(): void {
    const phases: RoutePhase[] = ['enter', 'entered', 'leave', 'reentered'];

    this.routes.forEach((route, path) => {
      for (const phase of phases) {
        const names = route.getHookNames(phase);
        if (names.length) this.attachPhaseHooks(path, route, phase, names);
      }
    });
  }

  private attachPhaseHooks(
    path: string,
    route: AURARoute,
    phase: RoutePhase,
    names: string[],
  ): void {
    const runHooks = async () => {
      const ctx = this.buildHookContext(route, phase);
      return RouteHookRegistry.run(names, ctx);
    };

    const finishBlocking = (result: boolean | void | string, done: (value?: boolean) => void) => {
      if (result === false) return done(false);
      if (typeof result === 'string') {
        this.navigate(result);
        return done(false);
      }
      done();
    };

    switch (phase) {
      case 'enter':
        this.engine.addBeforeHook(path, async (done) => {
          finishBlocking(await runHooks(), done);
        });
        break;
      case 'entered':
        this.engine.addAfterHook(path, async () => {
          await runHooks();
        });
        break;
      case 'leave':
        this.engine.addLeaveHook(path, async (done) => {
          finishBlocking(await runHooks(), done);
        });
        break;
      case 'reentered':
        this.engine.addAlreadyHook(path, async () => {
          await runHooks();
        });
        break;
    }
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
import Navigo, { type Match } from 'navigo';

import type { RoutingEngineProvider } from '../provider';
import type {
  NavigateOptions,
  NavigationContext,
  NotFoundHandler,
  PhaseHandler,
  ProviderRouteRegistration,
  RouteMatch,
  RoutingEngineBinding,
} from '../types';
import type { NavigoProviderConfig } from './navigo-config';
import { currentLocationUrl, firstMatch, matchPattern, toRouteMatch } from './navigo-match';

type NavigoDone = (value?: boolean) => void;

export class NavigoProvider implements RoutingEngineProvider {
  readonly id = 'navigo';

  private readonly config: NavigoProviderConfig;
  private binding?: RoutingEngineBinding;
  private navigo?: Navigo;
  private notFoundHandler?: NotFoundHandler;
  private readonly registrations = new Map<string, ProviderRouteRegistration>();
  private activeMatch: RouteMatch | null = null;

  constructor(config: NavigoProviderConfig) {
    this.config = config;
  }

  bind(binding: RoutingEngineBinding): void {
    this.binding = binding;
  }

  registerRoute(registration: ProviderRouteRegistration): void {
    this.registrations.set(registration.pattern, registration);

    if (this.navigo) {
      this.wireRoute(registration);
    }
  }

  start(): void {
    this.ensureNavigo().resolve();
  }

  destroy(): void {
    this.teardownNavigo(true);
  }

  clearRoutes(): void {
    this.teardownNavigo();
  }

  navigate(path: string, options?: NavigateOptions): void {
    const engine = this.ensureNavigo();

    engine.navigate(
      path,
      options?.replace ? { historyAPIMethod: 'replaceState' } : undefined,
    );
  }

  setNotFoundHandler(handler: NotFoundHandler): void {
    this.notFoundHandler = handler;
    this.navigo?.notFound(() => handler(currentLocationUrl()));
  }

  rebindLinks(): void {
    this.navigo?.updatePageLinks();
  }

  // ——— Navigo wiring ———

  private wireRoute({ pattern, render, phases }: ProviderRouteRegistration): void {
    const navigo = this.ensureNavigo();

    navigo.on(pattern, (match?: Match) => {
      void this.runRender(render, pattern, match);
    });

    navigo.addBeforeHook(pattern, (done: NavigoDone, match: Match) => {
      void this.runBefore(pattern, match, phases.enter, done);
    });

    if (phases.leave) {
      navigo.addLeaveHook(pattern, (done: NavigoDone, match: Match | Match[]) => {
        void this.runLeave(pattern, match, phases.leave!, done);
      });
    }

    if (phases.entered) {
      navigo.addAfterHook(pattern, (match: Match) => {
        void this.runOptionalPhase('entered', pattern, match, phases.entered!);
      });
    }

    if (phases.reentered) {
      navigo.addAlreadyHook(pattern, (match: Match) => {
        void this.runOptionalPhase('reentered', pattern, match, phases.reentered!);
      });
    }
  }

  // ——— Phase pipeline ———

  private async runRender(
    render: ProviderRouteRegistration['render'],
    pattern: string,
    match?: Match,
  ): Promise<void> {
    const routeMatch = toRouteMatch(match ?? null, pattern);
    if (!routeMatch) return;

    await render(routeMatch);
    this.activeMatch = routeMatch;
  }

  /** onTransition → enter (blocking) */
  private async runBefore(
    pattern: string,
    match: Match,
    enterHandler: PhaseHandler | undefined,
    done: NavigoDone,
  ): Promise<void> {
    const to = toRouteMatch(match, pattern);
    if (!to) {
      done();
      return;
    }

    const from = this.activeMatch;
    this.requireBinding().onTransition({ from, to });

    if (!enterHandler) {
      done();
      return;
    }

    await this.runBlockingPhase({ phase: 'enter', from, to }, enterHandler, done);
  }

  /** leave (blocking) */
  private async runLeave(
    pattern: string,
    match: Match | Match[],
    handler: PhaseHandler,
    done: NavigoDone,
  ): Promise<void> {
    const target = firstMatch(match);
    const targetPattern = matchPattern(target, pattern);
    const from = this.activeMatch ?? { path: pattern, pattern };
    const to = toRouteMatch(target, targetPattern) ?? { path: '', pattern: targetPattern };

    await this.runBlockingPhase({ phase: 'leave', from, to }, handler, done);
  }

  /** entered / reentered */
  private async runOptionalPhase(
    phase: 'entered' | 'reentered',
    pattern: string,
    match: Match,
    handler: PhaseHandler,
  ): Promise<void> {
    const ctx = this.phaseContext(phase, pattern, match);
    if (!ctx) return;

    await handler(ctx);
  }

  private async runBlockingPhase(
    ctx: NavigationContext,
    handler: PhaseHandler,
    done: NavigoDone,
  ): Promise<void> {
    const blocked = await this.requireBinding().onGuardResult(await handler(ctx));

    done(blocked ? false : undefined);
  }

  private phaseContext(
    phase: NavigationContext['phase'],
    pattern: string,
    match: Match,
  ): NavigationContext | null {
    const to = toRouteMatch(match, pattern);
    if (!to) return null;

    return { phase, from: this.activeMatch, to };
  }

  // ——— Lifecycle ———

  private ensureNavigo(): Navigo {
    if (this.navigo) return this.navigo;

    this.navigo = new Navigo(this.config.root ?? '/', {
      strategy: this.config.strategy ?? 'ONE',
      hash: this.config.hash ?? false,
      noMatchWarning: this.config.noMatchWarning ?? false,
      linksSelector: this.config.linksSelector ?? '[data-router-link]',
    });

    if (this.notFoundHandler) {
      this.navigo.notFound(() => this.notFoundHandler!(currentLocationUrl()));
    }

    for (const registration of this.registrations.values()) {
      this.wireRoute(registration);
    }

    return this.navigo;
  }

  private teardownNavigo(clearRegistrations = false): void {
    this.navigo?.destroy();
    this.navigo = undefined;
    this.activeMatch = null;

    if (clearRegistrations) {
      this.registrations.clear();
    }
  }

  private requireBinding(): RoutingEngineBinding {
    if (!this.binding) {
      throw new Error('NavigoProvider: bind() must be called before navigation');
    }
    return this.binding;
  }
}

export function createNavigoProvider(config: NavigoProviderConfig): NavigoProvider {
  return new NavigoProvider(config);
}

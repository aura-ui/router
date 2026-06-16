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

/**
 * Navigo adapter for {@link RoutingEngineProvider}.
 *
 * Maps aura-ui-router phases to Navigo hooks:
 *
 * | Aura phase | Navigo API |
 * |------------|------------|
 * | `leave` + `leaving` + `left` | `addLeaveHook` → await leave → leaving → left |
 * | `onTransition` + `enter` + `load` + `entering` | `addBeforeHook` |
 * | `render` + `entered` | `on` → await render → entered |
 * | `error` | `on` catch — after failed render |
 * | `reentered` | `addAlreadyHook` |
 *
 * `lastRenderedMatch` tracks the route after `render` — used by `leave` hooks.
 * The facade's `current` / `previous` are updated earlier, in `onTransition`.
 */
export class NavigoProvider implements RoutingEngineProvider {
  readonly id = 'navigo';

  private readonly config: NavigoProviderConfig;
  private binding?: RoutingEngineBinding;
  private navigo?: Navigo;
  private notFoundHandler?: NotFoundHandler;
  private readonly registrations = new Map<string, ProviderRouteRegistration>();
  /** Last route that completed `render` — `leave` needs this, not the facade's `current`. */
  private lastRenderedMatch: RouteMatch | null = null;

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
      void this.runRenderPhase(render, pattern, match, phases.entered, phases.error);
    });

    navigo.addBeforeHook(pattern, (done: NavigoDone, match: Match) => {
      void this.runEnterPhase(pattern, match, phases.enter, phases.load, phases.entering, done);
    });

    if (phases.leave || phases.leaving || phases.left) {
      navigo.addLeaveHook(pattern, (done: NavigoDone, match: Match | Match[]) => {
        void this.runLeavePhase(pattern, match, phases.leave, phases.leaving, phases.left, done);
      });
    }

    if (phases.reentered) {
      navigo.addAlreadyHook(pattern, (match: Match) => {
        void this.runOptionalPhase('reentered', pattern, match, phases.reentered!);
      });
    }
  }

  // ——— Phase pipeline ———

  /** `render` then `entered`; on failure run `error` instead. Wired to Navigo `on`. */
  private async runRenderPhase(
    render: ProviderRouteRegistration['render'],
    pattern: string,
    match: Match | undefined,
    enteredHandler?: PhaseHandler,
    errorHandler?: PhaseHandler,
  ): Promise<void> {
    const routeMatch = toRouteMatch(match ?? null, pattern);
    if (!routeMatch) return;

    try {
      await render(routeMatch);
      this.lastRenderedMatch = routeMatch;

      if (!enteredHandler || !match) return;

      await this.runOptionalPhase('entered', pattern, match, enteredHandler);
    } catch (error) {
      this.lastRenderedMatch = routeMatch;

      if (!errorHandler || !match) return;

      await this.runErrorPhase(pattern, match, errorHandler, error);
    }
  }

  /** `onTransition` → `enter` → `load` → `entering`. Wired to Navigo `addBeforeHook`. */
  private async runEnterPhase(
    pattern: string,
    match: Match,
    enterHandler: PhaseHandler | undefined,
    loadHandler: PhaseHandler | undefined,
    enteringHandler: PhaseHandler | undefined,
    done: NavigoDone,
  ): Promise<void> {
    const to = toRouteMatch(match, pattern);
    if (!to) {
      done();
      return;
    }

    const from = this.lastRenderedMatch;
    this.requireBinding().onTransition({ from, to });

    if (enterHandler) {
      const enterBlocked = await this.requireBinding().onGuardResult(
        await enterHandler({ phase: 'enter', from, to }),
      );

      if (enterBlocked) {
        done(false);
        return;
      }
    }

    if (loadHandler) {
      const loadBlocked = await this.requireBinding().onGuardResult(
        await loadHandler({ phase: 'load', from, to }),
      );

      if (loadBlocked) {
        done(false);
        return;
      }
    }

    if (enteringHandler) {
      await enteringHandler({ phase: 'entering', from, to });
    }

    done();
  }

  /** `leave` → `leaving` → `left`. Wired to Navigo `addLeaveHook`. */
  private async runLeavePhase(
    pattern: string,
    match: Match | Match[],
    leaveHandler: PhaseHandler | undefined,
    leavingHandler: PhaseHandler | undefined,
    leftHandler: PhaseHandler | undefined,
    done: NavigoDone,
  ): Promise<void> {
    const ctx = this.buildLeaveContext(pattern, match);

    if (leaveHandler) {
      const blocked = await this.requireBinding().onGuardResult(await leaveHandler(ctx));

      if (blocked) {
        done(false);
        return;
      }
    }

    if (leavingHandler) {
      await leavingHandler({ ...ctx, phase: 'leaving' });
    }

    if (leftHandler) {
      await leftHandler({ ...ctx, phase: 'left' });
    }

    done();
  }

  /**
   * Navigo `addLeaveHook` passes the *target* match, not the leaving route.
   * Normalize to {@link NavigationContext} contract: `from` = active route, `to` = target.
   */
  private buildLeaveContext(pattern: string, match: Match | Match[]): NavigationContext {
    const target = firstMatch(match);
    const targetPattern = matchPattern(target, pattern);
    const to = toRouteMatch(target, targetPattern) ?? { path: '', pattern: targetPattern };

    return {
      phase: 'leave',
      from: this.resolveLeaveFrom(pattern),
      to,
    };
  }

  /** Active route on leave — always non-null; falls back to the leaving route pattern. */
  private resolveLeaveFrom(pattern: string): RouteMatch {
    const active = this.lastRenderedMatch;

    if (!active) {
      return { path: pattern, pattern };
    }

    if (!active.path) {
      return { ...active, path: pattern };
    }

    return active;
  }

  /** `entered` / `reentered` — non-blocking. */
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

  /** `error` — non-blocking; runs when `load` or `render` fails. */
  private async runErrorPhase(
    pattern: string,
    match: Match,
    handler: PhaseHandler,
    error: unknown,
  ): Promise<void> {
    const ctx = this.phaseContext('error', pattern, match);
    if (!ctx) return;

    await handler({ ...ctx, error });
  }

  private phaseContext(
    phase: NavigationContext['phase'],
    pattern: string,
    match: Match,
  ): NavigationContext | null {
    const to = toRouteMatch(match, pattern);
    if (!to) return null;

    return { phase, from: this.lastRenderedMatch, to };
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
    this.lastRenderedMatch = null;

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

import type { AURARoute } from '../../aura-route/core';
import type { GuardResult, NavigationContext, NavigationEvent, RouteMatch } from '../../aura-routing-engine/core';
import type { NavigationJobManager } from './navigation-job';
import type { NavigationPhaseRunner } from './navigation-phase-runner';
import { buildPlan } from './transition-plan';

export interface NavigationCoordinatorDeps {
  jobManager: NavigationJobManager;
  phaseRunner: NavigationPhaseRunner;
  getRoute: (pattern: string) => AURARoute | undefined;
  renderRoute: (route: AURARoute) => Promise<void>;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  rebindLinks: () => void;
}

/**
 * NavigationCoordinator orchestrates a navigation transaction:
 *
 * - **Prepare** (pre-commit): deactivate `leave` (bubble) → activate `enter` + `load` (capture)
 * - **Pre-commit effects**: activate `entering`
 * - **Commit**: `render` (commit point)
 * - **Post-commit**: deactivate `leaving` + `left` (bubble) → activate `entered` (capture)
 */
export class NavigationCoordinator {
  private readonly deps: NavigationCoordinatorDeps;

  constructor(deps: NavigationCoordinatorDeps) {
    this.deps = deps;
  }

  async run(event: NavigationEvent): Promise<boolean> {
    const plan = buildPlan(event.from, event.to);
    const toRoute = this.deps.getRoute(event.to.pattern);

    if (!toRoute) {
      console.warn(`NavigationCoordinator: no route for pattern "${event.to.pattern}"`);
      return false;
    }

    const fromRoute = plan.deactivate[0]
      ? this.deps.getRoute(plan.deactivate[0].pattern)
      : undefined;

    if (plan.reentered) {
      return this.runReenteredOnly(toRoute, event);
    }

    this.deps.jobManager.begin(event.intent);
    const snapshot = { from: event.from, to: event.to };

    // ——— Prepare: exit guards (bubble) ———
    if (fromRoute) {
      const blocked = await this.runBlocking(() =>
        this.deps.phaseRunner.runLeave(fromRoute, this.ctx('leave', snapshot)),
      );
      if (blocked) return false;
    }

    // ——— Prepare: enter + load (capture) ———
    for (const ref of plan.activate) {
      const route = this.routeFor(ref.pattern, toRoute);
      if (!route) continue;

      const enterBlocked = await this.runBlocking(() =>
        this.deps.phaseRunner.runEnter(route, this.ctx('enter', snapshot)),
      );
      if (enterBlocked) return false;

      try {
        const loadBlocked = await this.runBlocking(() =>
          this.deps.phaseRunner.runLoad(route, this.ctx('load', snapshot)),
        );
        if (loadBlocked) return false;
      } catch (error) {
        await this.deps.phaseRunner.runError(route, {
          ...this.ctx('error', snapshot),
          error,
        });
        return false;
      }
    }

    // ——— Pre-commit: entering (capture) ———
    for (const ref of plan.activate) {
      const route = this.routeFor(ref.pattern, toRoute);
      if (!route) continue;
      await this.deps.phaseRunner.runEntering(route, this.ctx('entering', snapshot));
    }

    // ——— Commit ———
    try {
      await this.deps.renderRoute(toRoute);
    } catch (error) {
      await this.deps.phaseRunner.runError(toRoute, {
        ...this.ctx('error', snapshot),
        error,
      });
      return false;
    }

    // ——— Post-commit: deactivate bubble (leaving → left) ———
    if (fromRoute) {
      await this.deps.phaseRunner.runLeaving(fromRoute, this.ctx('leaving', snapshot));
      await this.deps.phaseRunner.runLeft(fromRoute, this.ctx('left', snapshot));
    }

    // ——— Post-commit: activate capture (entered) ———
    const enteredResult = await this.deps.phaseRunner.runEntered(
      toRoute,
      this.ctx('entered', snapshot),
    );
    if (this.applyRedirect(enteredResult)) return true;

    this.deps.rebindLinks();
    return true;
  }

  private async runReenteredOnly(route: AURARoute, event: NavigationEvent): Promise<boolean> {
    this.deps.jobManager.begin(event.intent);
    const result = await this.deps.phaseRunner.runReentered(
      route,
      this.ctx('reentered', { from: event.from, to: event.to }),
    );

    if (this.applyRedirect(result)) return true;

    this.deps.rebindLinks();
    return true;
  }

  private routeFor(pattern: string, toRoute: AURARoute): AURARoute | undefined {
    if (pattern === toRoute.path) return toRoute;
    return this.deps.getRoute(pattern);
  }

  /** Blocking guard: cancel or redirect — returns `true` when navigation must stop. */
  private async runBlocking(run: () => Promise<GuardResult>): Promise<boolean> {
    const result = await run();
    if (result === false) return true;
    return this.applyRedirect(result);
  }

  private applyRedirect(result: GuardResult): boolean {
    if (typeof result === 'string') {
      this.deps.navigate(result);
      return true;
    }
    return false;
  }

  private ctx(
    phase: NavigationContext['phase'],
    snapshot: { from: RouteMatch | null; to: RouteMatch },
    error?: unknown,
  ): NavigationContext {
    return {
      phase,
      from: snapshot.from,
      to: snapshot.to,
      ...(error !== undefined && { error }),
    };
  }
}

export { buildPlan, type TransitionPlan } from './transition-plan';

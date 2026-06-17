import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteInfo, RouteLifecycleContext, RouterInstance } from '../../aura-route-hooks/core';
import type { AURARoute } from '../../aura-route/core';
import type { GuardResult, NavigationContext, RouteMatch } from '../../aura-routing-engine/core';
import type { NavigationJobManager } from './navigation-job';
import type { NavigationCoordinator } from './navigation-coordinator';

export interface NavigationPhaseRunnerDeps {
  jobManager: NavigationJobManager;
  coordinator: NavigationCoordinator;
  router: RouterInstance;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  rebindLinks: () => void;
}

/**
 * Executes route lifecycle phases and hooks for a single navigation.
 * Pure orchestration — no DOM or routing engine wiring.
 */
export class NavigationPhaseRunner {
  private readonly deps: NavigationPhaseRunnerDeps;

  constructor(deps: NavigationPhaseRunnerDeps) {
    this.deps = deps;
  }

  /** enter: route lifecycle → hooks (blocking). */
  async runEnter(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    return this.deps.coordinator.runPrepare({
      enter: async () => {
        const ctx = this.toLifecycleContext(route, navCtx);
        route.onEnter(ctx);
        return this.runHooks(ctx, route.enter);
      },
    });
  }

  /** load: route lifecycle → hooks (blocking); failures run `error` phase. */
  async runLoad(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    try {
      return await this.deps.coordinator.runPrepare({
        load: async () => {
          const ctx = this.toLifecycleContext(route, navCtx);
          route.onLoad(ctx);
          return this.runHooks(ctx, route.load, { onThrow: 'error' });
        },
      });
    } catch (error) {
      await this.runError(route, navCtx, error);
      return false;
    }
  }

  /** entering: route lifecycle → hooks (non-blocking, before render). */
  async runEntering(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    await this.deps.coordinator.runPost({
      entering: async () => {
        const ctx = this.toLifecycleContext(route, navCtx);
        route.onEntering(ctx);
        this.warnIgnoredEffectResult(
          await this.runHooks(ctx, route.entering, { blocking: false }),
          route.path,
          'entering',
        );
      },
    });
  }

  /** entered: route lifecycle → hooks; redirect handled here. */
  async runEntered(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    await this.deps.coordinator.runPost({
      entered: async () => {
        const ctx = this.toLifecycleContext(route, navCtx);
        const generation = this.deps.jobManager.routerGeneration;
        const job = this.deps.jobManager.requireActive();
        route.onEntered(ctx);
        const result = await this.runHooks(ctx, route.entered, { blocking: false });

        if (this.deps.jobManager.isStale(job, generation)) return;

        if (typeof result === 'string') {
          this.deps.navigate(result);
          return;
        }

        this.deps.rebindLinks();
      },
    });
  }

  /** leave: blocking guards only. */
  async runLeave(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    return this.deps.coordinator.runPrepare({
      leave: async () => {
        const ctx = this.toLifecycleContext(route, navCtx);
        return this.runHooks(ctx, route.leave);
      },
    });
  }

  /** leaving: route lifecycle → hooks (non-blocking, before teardown). */
  async runLeaving(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    await this.deps.coordinator.runPost({
      leaving: async () => {
        const ctx = this.toLifecycleContext(route, navCtx);
        route.onLeaving(ctx);
        this.warnIgnoredEffectResult(
          await this.runHooks(ctx, route.leaving, { blocking: false }),
          route.path,
          'leaving',
        );
      },
    });
  }

  /** left: route teardown → hooks (non-blocking). */
  async runLeft(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    await this.deps.coordinator.runPost({
      left: async () => {
        const ctx = this.toLifecycleContext(route, navCtx);
        route.onLeft(ctx);
        this.warnIgnoredEffectResult(
          await this.runHooks(ctx, route.left, { blocking: false }),
          route.path,
          'left',
        );
      },
    });
  }

  /** error: route lifecycle → hooks (non-blocking, after load/render failure). */
  async runError(
    route: AURARoute,
    navCtx: NavigationContext,
    error?: unknown,
  ): Promise<void> {
    await this.deps.coordinator.runError(async () => {
      const failure = error ?? navCtx.error;
      const ctx = this.toLifecycleContext(route, {
        ...navCtx,
        phase: 'error',
        ...(failure !== undefined && { error: failure }),
      });
      route.onError(ctx);
      this.warnIgnoredEffectResult(
        await this.runHooks(ctx, route.error, { blocking: false }),
        route.path,
        'error',
      );
    });
  }

  /** reentered: route lifecycle → hooks; redirect handled here. */
  async runReentered(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    await this.deps.coordinator.runReentered(async () => {
      const ctx = this.toLifecycleContext(route, navCtx);
      const generation = this.deps.jobManager.routerGeneration;
      const job = this.deps.jobManager.requireActive();
      route.onReentered(ctx);
      const result = await this.runHooks(ctx, route.reentered, { blocking: false });

      if (this.deps.jobManager.isStale(job, generation)) return;

      if (typeof result === 'string') {
        this.deps.navigate(result);
        return;
      }

      this.deps.rebindLinks();
    });
  }

  private warnIgnoredEffectResult(result: GuardResult, path: string, phase: string): void {
    if (result === false || typeof result === 'string') {
      console.warn(
        `${phase} phase hook on "${path}" returned ${result === false ? 'false' : 'redirect'} — ignored`,
      );
    }
  }

  private async runHooks(
    ctx: RouteLifecycleContext,
    hookNames: string[],
    options?: { onThrow?: 'cancel' | 'error'; blocking?: boolean },
  ): Promise<GuardResult> {
    const { jobManager } = this.deps;
    const generation = jobManager.routerGeneration;
    const job = jobManager.requireActive();
    const isStale = () => jobManager.isStale(job, generation);

    try {
      if (!hookNames.length) return undefined;

      const result = await RouteHookRegistry.run(hookNames, ctx, { isStale });

      if (isStale()) {
        return options?.blocking === false ? undefined : false;
      }

      return result;
    } catch (error) {
      if (isStale()) {
        return options?.blocking === false ? undefined : false;
      }

      console.error(error);

      if (options?.onThrow === 'error') {
        throw error;
      }

      return false;
    }
  }

  private toLifecycleContext(
    route: AURARoute,
    navCtx: NavigationContext,
  ): RouteLifecycleContext {
    const job = this.deps.jobManager.resolveForPhase(navCtx.phase);

    return {
      phase: navCtx.phase,
      router: this.deps.router,
      route,
      from: this.toRouteInfo(navCtx.from),
      to: this.toRouteInfo(navCtx.to) ?? { path: '' },
      jobId: job.id,
      signal: job.signal,
      ...(navCtx.error !== undefined && { error: navCtx.error }),
    };
  }

  private toRouteInfo(match: RouteMatch | null): RouteInfo | null {
    if (!match) return null;

    return {
      path: match.path,
      ...(match.params && { params: { ...match.params } }),
      ...(match.query && { query: { ...match.query } }),
    };
  }
}

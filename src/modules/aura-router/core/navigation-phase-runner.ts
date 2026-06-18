import { RouteHookRegistry } from '../../aura-route-hooks/core';
import type { RouteInfo, RouteLifecycleContext } from '../../aura-route-hooks/core';
import type { AURARoute } from '../../aura-route/core';
import type { GuardResult, NavigationContext, RouteMatch } from '../../aura-routing-engine/core';
import type { NavigationServices } from './navigation-services';

/**
 * Executes a single route lifecycle phase and its hooks.
 * Called by NavigationCoordinator — does not orchestrate phase order.
 */
export class NavigationPhaseRunner {
  private readonly deps: NavigationServices;

  constructor(deps: NavigationServices) {
    this.deps = deps;
  }

  async runEnter(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEnter(ctx);
    return this.runHooks(ctx, route.enter);
  }

  async runLoad(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onLoad(ctx);
    return this.runHooks(ctx, route.load, { onThrow: 'error' });
  }

  async runEntering(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEntering(ctx);
    this.warnIgnoredEffectResult(
      await this.runHooks(ctx, route.entering, { blocking: false }),
      route.path,
      'entering',
    );
  }

  async runEntered(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onEntered(ctx);
    const result = await this.runHooks(ctx, route.entered, { blocking: false });
    this.warnIgnoredEffectResult(result, route.path, 'entered');
    return result;
  }

  async runLeave(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    return this.runHooks(ctx, route.leave);
  }

  async runLeaving(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onLeaving(ctx);
    this.warnIgnoredEffectResult(
      await this.runHooks(ctx, route.leaving, { blocking: false }),
      route.path,
      'leaving',
    );
  }

  async runLeft(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onLeft(ctx);
    this.warnIgnoredEffectResult(
      await this.runHooks(ctx, route.left, { blocking: false }),
      route.path,
      'left',
    );
  }

  async runError(route: AURARoute, navCtx: NavigationContext): Promise<void> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onError(ctx);
    this.warnIgnoredEffectResult(
      await this.runHooks(ctx, route.error, { blocking: false }),
      route.path,
      'error',
    );
  }

  async runReentered(route: AURARoute, navCtx: NavigationContext): Promise<GuardResult> {
    const ctx = this.toLifecycleContext(route, navCtx);
    route.onReentered(ctx);
    const result = await this.runHooks(ctx, route.reentered, { blocking: false });
    this.warnIgnoredEffectResult(result, route.path, 'reentered');
    return result;
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
    const job = this.deps.jobManager.requireActive();

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

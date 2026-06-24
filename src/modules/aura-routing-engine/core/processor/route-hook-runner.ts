import { RouteHookRegistry } from '../../../aura-route-hooks/core/route-hook-registry';
import type { RouteLifecycleContext } from '../../../aura-route-hooks/core';
import type { MatchedRouteInfo } from '../match/url-matcher';
import type { TransitionPolicy } from '../transition/policy';
import type { GuardResult } from '../guard.types';
import type { AuraRoutingProcessorJob } from './job';

/** Outcome of {@link RouteHookRunner.runViewCommit}. */
export type ViewCommitResult = 'aborted' | 'ok';

/** Runs lifecycle hooks and view commit for a single route (used by {@link ProcessorPipeline}). */
export class RouteHookRunner {

  /**
   * Runs route attr hooks for `lifecycleContext.phase` via {@link RouteHookRegistry}.
   * @param lifecycleContext - ctx passed to each hook (`leave`, `enter`, `load`, …)
   * @param isJobActive - false when the navigation job was superseded or the router was torn down
   */
  static async runLifecycleHooks(
    lifecycleContext: RouteLifecycleContext,
    isJobActive: () => boolean,
  ): Promise<GuardResult> {
    const hookNames = lifecycleContext.route[lifecycleContext.phase];
    if (!hookNames?.length) return;
    return this.runNamedHooks(lifecycleContext, hookNames, isJobActive);
  }

  /**
   * View commit: `route.render()` for the activate branch (not a lifecycle hook).
   * @param matchedRoute - match info passed to `route.render()`
   * @param job - navigation job; `job.signal` is passed into `route.render()` for cancellation
   * @param transitionPolicy - router transition policy; enables staged outlet mounts when applicable
   */
  static async runViewCommit(
    matchedRoute: MatchedRouteInfo,
    job: AuraRoutingProcessorJob,
    transitionPolicy?: TransitionPolicy,
  ): Promise<ViewCommitResult> {
    if (job.aborted) return 'aborted';

    await matchedRoute.route.render(matchedRoute, { signal: job.signal, transitionPolicy });

    return job.aborted ? 'aborted' : 'ok';
  }

  /**
   * Runs hooks by name; maps a superseded job to `false` so blocking phases cancel navigation.
   * {@link RouteHookRegistry.run} returns `undefined` on stale job; the pipeline only treats `false` as cancel.
   */
  private static async runNamedHooks(
    lifecycleContext: RouteLifecycleContext,
    hookNames: string[],
    isJobActive: () => boolean,
  ): Promise<GuardResult> {
    try {
      const result = await RouteHookRegistry.run(lifecycleContext, hookNames, isJobActive);
      if (!isJobActive()) return false;
      return result;
    } catch (error) {
      if (!isJobActive()) return false;
      throw error;
    }
  }
}

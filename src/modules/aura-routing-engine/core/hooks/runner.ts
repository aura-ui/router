import type { MatchedRouteInfo } from '../match/url-matcher';
import type { GuardResult } from '../guard.types';
import type { AuraRoutingProcessorJob } from '../processor/job';
import type { HookRegistry } from './registry';
import { defaultHookRegistry } from './registry';
import type { RouteLifecycleContext, ViewCommitResult } from './types';

export class HookRunner {
  private readonly registry: HookRegistry;

  constructor(registry: HookRegistry = defaultHookRegistry) {
    this.registry = registry;
  }

  async runPhaseHooks(
    lifecycleContext: RouteLifecycleContext,
    hookNames: readonly string[],
    isJobActive: () => boolean,
  ): Promise<GuardResult> {
    if (!hookNames.length) return undefined;

    try {
      const result = await this.registry.run(lifecycleContext, hookNames, isJobActive);
      if (!isJobActive()) return false;
      return result;
    } catch (error) {
      if (!isJobActive()) return false;
      throw error;
    }
  }

  async runViewCommit(
    matchedRoute: MatchedRouteInfo,
    job: AuraRoutingProcessorJob,
  ): Promise<ViewCommitResult> {
    if (job.aborted) return 'aborted';

    await matchedRoute.route.render(matchedRoute, { parentSignal: job.signal });

    return job.aborted ? 'aborted' : 'ok';
  }
}

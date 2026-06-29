import { resolveRouteData } from '../../data-graph/route-data';
import type { NavigationErrorPhase } from '../../failure';
import type { MatchedRouteInfo } from '../../match/url-matcher';
import type { NavigationErrorResult } from '../../navigation/transaction-result';
import { resolveHookNames } from '../bindings/route-hook-bindings';
import { createLifecycleContext } from '../context/lifecycle-context';
import { PhaseExecutor } from '../execution/phase-executor';
import type { PipelineStepOutcome } from '../execution/phase-outcome';
import { HookPolicyExecutor } from '../execution/hook-policy-executor';
import type { PipelinePhaseDefinition } from '../phase-registry';

import { ErrorPhaseHandler } from './error-phase-handler';
import type { LifecycleRuntimeContext } from './lifecycle-runner.types';
import { toLifecycleContextInput } from './lifecycle-runtime-adapter';

/** Runs lifecycle phases across transition-plan route branches. */
export class LifecycleRunner {
  private readonly phaseExecutor: PhaseExecutor;
  private readonly errorPhaseHandler: ErrorPhaseHandler;

  constructor(
    phaseExecutor?: PhaseExecutor,
    errorPhaseHandler?: ErrorPhaseHandler,
  ) {
    const hookPolicies = new HookPolicyExecutor();
    this.phaseExecutor = phaseExecutor ?? new PhaseExecutor(hookPolicies);
    this.errorPhaseHandler = errorPhaseHandler ?? new ErrorPhaseHandler(hookPolicies);
  }

  async runPhase(
    phase: PipelinePhaseDefinition,
    context: LifecycleRuntimeContext,
  ): Promise<PipelineStepOutcome> {
    const matchedRoutes = context.transaction.plan[phase.targetRoutes];

    for (const matchedRoute of matchedRoutes) {
      const outcome = await this.runPhaseForRoute(phase, matchedRoute, context);
      if (outcome) return outcome;
    }

    return null;
  }

  failNavigation(
    matchedRoute: MatchedRouteInfo,
    error: unknown,
    errorPhase: NavigationErrorPhase,
    context: LifecycleRuntimeContext,
  ): Promise<NavigationErrorResult> {
    return this.errorPhaseHandler.failNavigation(matchedRoute, error, errorPhase, context);
  }

  private runPhaseForRoute(
    phase: PipelinePhaseDefinition,
    matchedRoute: MatchedRouteInfo,
    context: LifecycleRuntimeContext,
  ): Promise<PipelineStepOutcome> {
    const input = toLifecycleContextInput(context);
    const routeData = context.dataSnapshot
      ? resolveRouteData(context.dataSnapshot, matchedRoute)
      : undefined;

    const lifecycleContext = createLifecycleContext(
      phase.phase,
      matchedRoute,
      {
        ...input,
        ...(routeData !== undefined && { data: routeData }),
      },
    );

    return this.phaseExecutor.execute({
      phase,
      route: matchedRoute.route,
      lifecycleContext,
      hookNames: resolveHookNames(matchedRoute.route, phase.phase),
      hookRegistry: context.hookRegistry,
      isJobActive: context.isJobActive,
      failWithError: (error) =>
        this.failNavigation(matchedRoute, error, phase.phase, context),
    });
  }

}

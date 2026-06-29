import type { HookRegistry } from '../../hooks/registry';
import type { NavigationErrorResult } from '../../navigation/transaction-result';
import type { RouteInstance, RouteLifecycleContext } from '../../route/types';
import { defaultLifecycleLogger, type LifecycleLogger } from '../logging/lifecycle-logger';
import type { PipelinePhaseDefinition } from '../phase-registry';

import { HookPolicyExecutor } from './hook-policy-executor';
import { phaseStepToPipelineOutcome, type PipelineStepOutcome } from './phase-outcome';
import { runPhaseStep } from './phase-step';

export interface PhaseExecutionInput {
  phase: PipelinePhaseDefinition;
  route: RouteInstance;
  lifecycleContext: RouteLifecycleContext;
  hookNames: readonly string[] | null;
  hookRegistry: HookRegistry;
  isJobActive: () => boolean;
  failWithError: (error: unknown) => Promise<NavigationErrorResult>;
}

/** Executes one lifecycle phase for one matched route. */
export class PhaseExecutor {
  private readonly hookPolicies: HookPolicyExecutor;
  private readonly logger: LifecycleLogger;

  constructor(
    hookPolicies?: HookPolicyExecutor,
    logger: LifecycleLogger = defaultLifecycleLogger,
  ) {
    this.hookPolicies = hookPolicies ?? new HookPolicyExecutor(logger);
    this.logger = logger;
  }

  async execute(input: PhaseExecutionInput): Promise<PipelineStepOutcome> {
    const hookContext = {
      hookRegistry: input.hookRegistry,
      isJobActive: input.isJobActive,
    };

    return phaseStepToPipelineOutcome(
      await runPhaseStep({
        lifecyclePhase: input.phase.phase,
        onThrow: input.phase.errorPolicy,
        hookPolicy: input.phase.hookPolicy,
        invokeRoute: () => input.phase.runRouteLifecycle(input.route, input.lifecycleContext),
        hookNames: input.hookNames,
        logger: this.logger,
        handlers: {
          runBlockingHooks: (names) =>
            this.hookPolicies.runBlocking(input.lifecycleContext, hookContext, names),
          runPostCommitHooks: (names, onError, phase) =>
            this.hookPolicies.runPostCommit(
              input.lifecycleContext,
              hookContext,
              names,
              onError,
              phase,
            ),
          failWithError: input.failWithError,
        },
      }),
    );
  }
}

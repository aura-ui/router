import type { NavigationErrorResult } from '../../navigation/transaction-result';
import type { RouteLifecycleContext } from '../../route/types';
import { defaultLifecycleLogger, type LifecycleLogger } from '../logging/lifecycle-logger';
import type { LifecycleHookHandling, PhaseThrowPolicy } from '../types';

import type { PhaseStepOutcome } from './phase-outcome';

export interface PhaseStepHandlers {
  runBlockingHooks: (hookNames: readonly string[]) => Promise<PhaseStepOutcome>;
  runPostCommitHooks: (
    hookNames: readonly string[],
    onError: 'propagate' | 'log',
    lifecyclePhase: RouteLifecycleContext['phase'],
  ) => Promise<PhaseStepOutcome>;
  failWithError: (error: unknown) => Promise<NavigationErrorResult>;
}

export interface PhaseStepInput {
  lifecyclePhase: RouteLifecycleContext['phase'];
  onThrow: PhaseThrowPolicy;
  hookPolicy: LifecycleHookHandling;
  invokeRoute: () => void;
  hookNames: readonly string[] | null;
  handlers: PhaseStepHandlers;
  logger?: LifecycleLogger;
}

/** Executes one route lifecycle callback, then its hooks, with a unified throw policy. */
export async function runPhaseStep(input: PhaseStepInput): Promise<PhaseStepOutcome> {
  const logger = input.logger ?? defaultLifecycleLogger;

  try {
    input.invokeRoute();
  } catch (error) {
    return handlePhaseThrow(
      input.onThrow,
      input.lifecyclePhase,
      error,
      input.handlers.failWithError,
      logger,
    );
  }

  if (!input.hookNames?.length) return null;

  try {
    if (input.hookPolicy.kind === 'blocking') {
      return await input.handlers.runBlockingHooks(input.hookNames);
    }

    return await input.handlers.runPostCommitHooks(
      input.hookNames,
      input.hookPolicy.onError,
      input.lifecyclePhase,
    );
  } catch (error) {
    return handlePhaseThrow(
      input.onThrow,
      input.lifecyclePhase,
      error,
      input.handlers.failWithError,
      logger,
    );
  }
}

async function handlePhaseThrow(
  onThrow: PhaseThrowPolicy,
  lifecyclePhase: RouteLifecycleContext['phase'],
  error: unknown,
  failWithError: PhaseStepHandlers['failWithError'],
  logger: LifecycleLogger,
): Promise<PhaseStepOutcome> {
  switch (onThrow) {
    case 'failure':
      return failWithError(error);
    case 'log':
      logger.phaseFailedAfterCommit(lifecyclePhase, error);
      return null;
    case 'propagate':
      throw error;
  }
}

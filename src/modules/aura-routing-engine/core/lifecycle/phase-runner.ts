import type { GuardResult } from '../guard.types';
import type { RoutePhase } from './types';
import type { RouteLifecycleContext } from '../hooks/types';
import type { CommitSnapshot } from '../view-mount/view-mount-state';
import type { NavigationFailureCode } from '../failure/navigation-error';
import type { NavigationErrorPhase } from '../failure/navigation-error';
import type { PhaseThrowPolicy } from './types';

export type PhaseStepErrorOutcome = {
  status: 'error';
  error: unknown;
  code: NavigationFailureCode;
  phase: NavigationErrorPhase;
  commit: CommitSnapshot;
};

export type PhaseStepOutcome =
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | PhaseStepErrorOutcome
  | null;

export interface PhaseStepHandlers {
  runBlockingHooks: (hookNames: readonly string[]) => Promise<PhaseStepOutcome>;
  runPostCommitHooks: (
    hookNames: readonly string[],
    hookErrors: 'propagate' | 'log',
    lifecyclePhase: RouteLifecycleContext['phase'],
  ) => Promise<PhaseStepOutcome>;
  failWithError: (error: unknown) => Promise<PhaseStepErrorOutcome>;
}

export interface PhaseStepInput {
  lifecyclePhase: RouteLifecycleContext['phase'];
  onThrow: PhaseThrowPolicy;
  hookKind: 'blocking' | 'postCommit';
  hookErrors?: 'propagate' | 'log';
  invokeRoute: () => void;
  hookNames: readonly string[] | null;
  handlers: PhaseStepHandlers;
}

/** Generic lifecycle phase runner — route callback, then hooks, unified throw policy. */
export async function runPhaseStep(input: PhaseStepInput): Promise<PhaseStepOutcome> {
  try {
    input.invokeRoute();
  } catch (error) {
    return handlePhaseThrow(input.onThrow, input.lifecyclePhase, error, input.handlers.failWithError);
  }

  if (!input.hookNames?.length) return null;

  try {
    if (input.hookKind === 'blocking') {
      return await input.handlers.runBlockingHooks(input.hookNames);
    }

    return await input.handlers.runPostCommitHooks(
      input.hookNames,
      input.hookErrors ?? 'propagate',
      input.lifecyclePhase,
    );
  } catch (error) {
    return handlePhaseThrow(input.onThrow, input.lifecyclePhase, error, input.handlers.failWithError);
  }
}

async function handlePhaseThrow(
  onThrow: PhaseThrowPolicy,
  lifecyclePhase: RouteLifecycleContext['phase'],
  error: unknown,
  failWithError: PhaseStepHandlers['failWithError'],
): Promise<PhaseStepOutcome> {
  switch (onThrow) {
    case 'failure':
      return failWithError(error);
    case 'log':
      console.error(`[${lifecyclePhase}] failed after commit:`, error);
      return null;
    case 'propagate':
      throw error;
  }
}

/** Maps blocking hook result to terminal outcome. */
export function guardResultToPhaseOutcome(hookResult: GuardResult): PhaseStepOutcome {
  if (hookResult === false) return { status: 'cancelled' };

  if (typeof hookResult === 'string') {
    return { status: 'redirect', url: hookResult };
  }

  if (hookResult && typeof hookResult === 'object' && 'url' in hookResult) {
    return {
      status: 'redirect',
      url: hookResult.url,
      ...(hookResult.replace !== undefined && { replace: hookResult.replace }),
    };
  }

  return null;
}

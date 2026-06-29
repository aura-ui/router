import type { GuardResult } from '../../guard.types';
import type { NavigationErrorResult, TransactionResult } from '../../navigation/transaction-result';

export type PhaseStepOutcome =
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
  | NavigationErrorResult
  | null;

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

export type PipelineStepOutcome = TransactionResult | null;

/**
 * Lifecycle step → processor terminal result.
 * Errors must be {@link NavigationErrorResult} from `failWithError` — unstructured `{ status: 'error' }` throws.
 */
export function phaseStepToPipelineOutcome(outcome: PhaseStepOutcome): PipelineStepOutcome {
  if (outcome?.status === 'error' && !('failure' in outcome)) {
    throw new Error(
      'Lifecycle phase error must be NavigationErrorResult — return ErrorPhaseHandler output in failWithError',
    );
  }

  return outcome;
}

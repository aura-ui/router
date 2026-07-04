import type { GuardResult } from '../types';
import type { TransactionFullResult } from '../../navigation/transaction-result';

export type PhaseStepOutcome =
  | { status: 'cancelled' }
  | { status: 'redirect'; url: string; replace?: boolean }
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

export type PipelineStepOutcome = TransactionFullResult;

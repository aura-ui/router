import type { ProcessorRunInput } from '../../core/processor/types';
import type { TransactionResult } from '../../core/navigation/transaction-result';

/** Resolves a mocked processor run and invokes {@link ProcessorRunInput.commitGate} on success. */
export function resolveMockProcessorRun(
  input: ProcessorRunInput,
  resolve: (result: TransactionResult) => void,
  result: TransactionResult,
): void {
  if (result.status === 'navigationSucceeded') {
    input.commitGate?.();
  }
  resolve(result);
}

/** Default mock: immediately succeeds and runs the commit gate. */
export function mockProcessorRunSuccess(run: jest.SpyInstance): void {
  run.mockImplementation(async (input: ProcessorRunInput) => {
    input.commitGate?.();
    return { status: 'navigationSucceeded' };
  });
}

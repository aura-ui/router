import { runPhaseHooks } from '../../core/hooks/registry';
import { runViewCommit } from '../../core/view-mount/view-commit-render';
import type { ContentLoadService } from '../../core';
import { createMockTransaction } from '../helpers/create-mock-transaction';

export const mockRunPhaseHooks = runPhaseHooks as jest.MockedFunction<typeof runPhaseHooks>;
export const mockRunViewCommit = runViewCommit as jest.MockedFunction<typeof runViewCommit>;

export function resetPipelineMocks(): void {
  jest.clearAllMocks();
  mockRunViewCommit.mockResolvedValue('ok');
  mockRunPhaseHooks.mockResolvedValue(undefined);
}

export function withContentLoad(
  options: Parameters<typeof createMockTransaction>[0],
): ReturnType<typeof createMockTransaction> {
  const transaction = createMockTransaction(options);
  transaction.engine.contentLoad = { resolve: jest.fn() } as unknown as ContentLoadService;
  return transaction;
}

export function trackLifecyclePhases(): { phases: string[] } {
  const phases: string[] = [];
  mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
    phases.push(ctx.phase);
  });
  return { phases };
}

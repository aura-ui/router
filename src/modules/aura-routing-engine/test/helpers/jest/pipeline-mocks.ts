import type { ContentGraph } from '../../../core';
import { runViewCommit } from '../../../core/view-mount/view-commit-render';
import { createMockTransaction } from '../create-mock-transaction';
import { mockRunPhaseHooks, resetHookMocks } from './hook-mocks';

export { mockRunPhaseHooks } from './hook-mocks';
export { resetHookMocks } from './hook-mocks';

export const mockRunViewCommit = runViewCommit as jest.MockedFunction<typeof runViewCommit>;

export function resetPipelineMocks(): void {
  resetHookMocks();
  mockRunViewCommit.mockResolvedValue('ok');
}

export function withContentGraph(
  options: Parameters<typeof createMockTransaction>[0],
): ReturnType<typeof createMockTransaction> {
  const transaction = createMockTransaction(options);
  transaction.engine.contentGraph = { loadView: jest.fn() } as unknown as ContentGraph;
  return transaction;
}

export function trackLifecyclePhases(): { phases: string[] } {
  const phases: string[] = [];
  mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
    phases.push(ctx.phase);
  });
  return { phases };
}

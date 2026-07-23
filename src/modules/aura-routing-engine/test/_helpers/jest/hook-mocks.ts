import { runPhaseHooks } from '../../../core/hooks/registry';

export const mockRunPhaseHooks = runPhaseHooks as jest.MockedFunction<typeof runPhaseHooks>;

export function resetHookMocks(): void {
  jest.clearAllMocks();
  mockRunPhaseHooks.mockResolvedValue(undefined);
}

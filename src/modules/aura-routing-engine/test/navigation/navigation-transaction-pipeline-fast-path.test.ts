import { HookRegistry, runPhaseHooks } from '../../core';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';

jest.mock('../../core/hooks/registry', () => ({
  ...jest.requireActual('../../core/hooks/registry'),
  runPhaseHooks: jest.fn(),
}));

const mockRunPhaseHooks = runPhaseHooks as jest.MockedFunction<typeof runPhaseHooks>;

describe('NavigationTransactionPipeline fast path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('skips guard hooks for trivial navigation', async () => {
    const transaction = createMockTransaction({
      from: createMatchedRoute('/a'),
      enterRoutes: [createMatchedRoute('/b')],
      transitionOrder: null,
    });
    const pipeline = new NavigationTransactionPipeline(transaction);

    const result = await pipeline.runFastPipeline();

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(mockRunPhaseHooks).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'guard' }),
      expect.anything(),
      expect.anything(),
    );
    expect(mockRunPhaseHooks).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'leave' }),
      expect.anything(),
      expect.anything(),
    );
    expect(transaction.engine.commitHistoryIfNeeded).toHaveBeenCalledWith(transaction);
    expect(transaction.engine.commitNavigation).toHaveBeenCalledWith(transaction);
  });

  it('runs enter hooks in full pipeline', async () => {
    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/b', { guard: ['auth'] })],
      transitionOrder: null,
    });

    await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(mockRunPhaseHooks).toHaveBeenCalled();
  });
});

jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../_helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  jest.requireActual('../_helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { createMatchedRoute, createMockTransaction } from '../_helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../_helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline fast path', () => {
  beforeEach(() => {
    resetPipelineMocks();
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

  it('passes live isActive check to view commit', async () => {
    mockRunViewCommit.mockImplementation(async (_route, cancellation) => {
      expect(cancellation.isAborted()).toBe(false);
      return 'ok';
    });

    const transaction = createMockTransaction({
      from: createMatchedRoute('/a'),
      enterRoutes: [createMatchedRoute('/b')],
      transitionOrder: null,
    });

    await new NavigationTransactionPipeline(transaction).runFastPipeline();

    expect(mockRunViewCommit).toHaveBeenCalledTimes(1);
  });

  it('marks view staged after successful view commit', async () => {
    mockRunViewCommit.mockResolvedValue('ok');

    const transaction = createMockTransaction({
      from: createMatchedRoute('/a'),
      enterRoutes: [createMatchedRoute('/b')],
      transitionOrder: null,
    });
    const stageSpy = jest.spyOn(transaction.viewCommitTracker, 'markViewStaged');

    await new NavigationTransactionPipeline(transaction).runFastPipeline();

    expect(stageSpy).toHaveBeenCalledTimes(1);
  });

  it('returns cancelled when view commit aborts', async () => {
    mockRunViewCommit.mockResolvedValue('aborted');

    const transaction = createMockTransaction({
      from: createMatchedRoute('/a'),
      enterRoutes: [createMatchedRoute('/b')],
      transitionOrder: null,
    });

    const result = await new NavigationTransactionPipeline(transaction).runFastPipeline();

    expect(result).toEqual({ status: 'cancelled' });
    expect(transaction.engine.commitNavigation).not.toHaveBeenCalled();
    expect(mockRunPhaseHooks).not.toHaveBeenCalled();
  });

  it('returns cancelled when superseded after view commit', async () => {
    mockRunViewCommit.mockResolvedValue('ok');

    const transaction = createMockTransaction({
      from: createMatchedRoute('/a'),
      enterRoutes: [createMatchedRoute('/b')],
      transitionOrder: null,
    });
    jest.spyOn(transaction, 'isActive').mockReturnValue(false);

    const result = await new NavigationTransactionPipeline(transaction).runFastPipeline();

    expect(result).toEqual({ status: 'cancelled' });
    expect(transaction.engine.commitNavigation).not.toHaveBeenCalled();
  });

  it('runs unmount recovery and returns error when view commit fails', async () => {
    const renderError = new Error('fast-path render failed');
    mockRunViewCommit.mockResolvedValue({ status: 'error', error: renderError });

    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const transaction = createMockTransaction({
      from: createMatchedRoute('/a', { unmount: ['cleanup'] }),
      exitRoutes: [createMatchedRoute('/a', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/b')],
      transitionOrder: null,
    });
    const recoverySpy = jest.spyOn(
      transaction.viewCommitTracker,
      'markViewCommittedAfterErrorRecovery',
    );

    const result = await new NavigationTransactionPipeline(transaction).runFastPipeline();

    expect(result!.status).toBe('error');
    expect(phases).toContain('unmount');
    expect(recoverySpy).toHaveBeenCalledTimes(1);
    expect(transaction.engine.commitNavigation).not.toHaveBeenCalled();
  });
});

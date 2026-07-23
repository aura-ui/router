jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../_helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  jest.requireActual('../_helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import {
  createMatchedRoute,
  createPairTransaction,
} from '../_helpers/create-mock-transaction';
import { PARALLEL_FADE_TRANSITION } from '../_helpers/jest/navigation-fixtures';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../_helpers/jest/pipeline-mocks';

describe('NavigationTransaction.isActive', () => {
  it('is false after cancel even when the transaction was not superseded', () => {
    const from = createMatchedRoute('/about');
    const to = createMatchedRoute('/gallery');
    const transaction = createPairTransaction({ from, to });

    expect(transaction.isActive()).toBe(true);
    expect(transaction.isStale()).toBe(false);

    transaction.cancel();

    expect(transaction.isAborted).toBe(true);
    expect(transaction.isStale()).toBe(false);
    expect(transaction.isActive()).toBe(false);
  });
});

describe('NavigationTransactionPipeline cancel-pending (A > B in-flight > A)', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('skips commit and left when aborted after parallel transitions without supersede', async () => {
    const commitStagedView = jest.fn();
    const onUnmount = jest.fn();
    const from = createMatchedRoute('/about', {
      onUnmount,
      transition: PARALLEL_FADE_TRANSITION,
      transitionOut: ['fade'],
    });
    const to = createMatchedRoute('/gallery', {
      commitStagedView,
      transition: PARALLEL_FADE_TRANSITION,
      transitionIn: ['fade'],
    });
    const transaction = createPairTransaction({ from, to });

    mockRunPhaseHooks.mockImplementation(async () => {
      transaction.cancel();
    });

    const pipeline = new NavigationTransactionPipeline(transaction);
    const outcome = await pipeline.runFullPipeline();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(commitStagedView).not.toHaveBeenCalled();
    expect(onUnmount).not.toHaveBeenCalled();
    expect(transaction.engine.commitNavigation).not.toHaveBeenCalled();
    expect(transaction.viewCommitTracker.isViewCommitted()).toBe(false);
  });

  it('runAfterRender returns cancelled when only abort happened (same transaction id)', async () => {
    const commitStagedView = jest.fn();
    const onUnmount = jest.fn();
    const from = createMatchedRoute('/about', { onUnmount });
    const to = createMatchedRoute('/gallery', { commitStagedView });
    const transaction = createPairTransaction({ from, to });

    transaction.viewCommitTracker.markViewStaged();
    transaction.cancel();

    const pipeline = new NavigationTransactionPipeline(transaction);
    const outcome = await pipeline.runAfterRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(commitStagedView).not.toHaveBeenCalled();
    expect(onUnmount).not.toHaveBeenCalled();
    expect(transaction.engine.commitNavigation).not.toHaveBeenCalled();
  });
});

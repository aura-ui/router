import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { ViewCommitTracker } from '../../core/view-mount/view-commit-tracker';
import {
  collectTransactionRoutes,
  rollbackUncommittedViews,
} from '../../core/view-mount/view-mount-rollback';
import {
  createMatchedRoute,
  createMockEngine,
  createNavigationTransaction,
} from '../_helpers/create-mock-transaction';
import { createTestRoute } from '../_helpers/create-test-route';

describe('view rollback', () => {
  it('collectTransactionRoutes deduplicates enter and exit branches', () => {
    const shared = createMatchedRoute('/shared', {
      asRoute: createTestRoute('/shared'),
    });
    const plan = {
      exitRoutes: [shared],
      enterRoutes: [shared],
      lca: null,
      update: false,
    };

    expect(collectTransactionRoutes(plan)).toHaveLength(1);
  });

  it('rollback calls revertInFlightView on affected routes', () => {
    const revertExit = jest.fn();
    const revertEnter = jest.fn();
    const plan = {
      exitRoutes: [createMatchedRoute('/from', { revertInFlightView: revertExit })],
      enterRoutes: [createMatchedRoute('/to', { revertInFlightView: revertEnter })],
      lca: null,
      update: false,
    };
    const viewCommitTracker = new ViewCommitTracker('/to');

    rollbackUncommittedViews(plan, viewCommitTracker);

    expect(revertExit).toHaveBeenCalledTimes(1);
    expect(revertEnter).toHaveBeenCalledTimes(1);
  });

  it('skips rollback after view commit', () => {
    const revertInFlightView = jest.fn();
    const plan = {
      exitRoutes: [],
      enterRoutes: [createMatchedRoute('/to', { revertInFlightView })],
      lca: null,
      update: false,
    };
    const viewCommitTracker = new ViewCommitTracker('/to');
    viewCommitTracker.markViewCommitted();

    rollbackUncommittedViews(plan, viewCommitTracker);

    expect(revertInFlightView).not.toHaveBeenCalled();
  });
});

describe('NavigationTransaction staged view rollback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createTransactionWithEnterGuard(revertInFlightView: jest.Mock) {
    const to = createMatchedRoute('/to', { guard: ['auth'], revertInFlightView });
    return createNavigationTransaction({
      engine: createMockEngine(),
      to,
      href: '/to',
    });
  }

  it('rolls back eagerly on transaction cancel', async () => {
    const revertInFlightView = jest.fn();
    const transaction = createTransactionWithEnterGuard(revertInFlightView);

    let resolvePipeline!: () => void;
    jest.spyOn(NavigationTransactionPipeline.prototype, 'runFullPipeline').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePipeline = () => resolve({ status: 'cancelled' });
        }),
    );

    const runPromise = transaction.run();
    await Promise.resolve();
    transaction.cancel();
    resolvePipeline();
    await runPromise;

    expect(revertInFlightView).toHaveBeenCalledTimes(1);
  });

  it('rolls back in finally when pipeline cancels without aborting the signal', async () => {
    const revertInFlightView = jest.fn();
    const transaction = createTransactionWithEnterGuard(revertInFlightView);

    jest.spyOn(NavigationTransactionPipeline.prototype, 'runFullPipeline').mockResolvedValue({
      status: 'cancelled',
    });

    await transaction.run();

    expect(transaction.isAborted).toBe(false);
    expect(revertInFlightView).toHaveBeenCalledTimes(1);
  });

  it('detaches abort listener when transaction completes with committed view', async () => {
    const revertInFlightView = jest.fn();
    const to = createMatchedRoute('/to', { revertInFlightView });
    const transaction = createNavigationTransaction({
      engine: createMockEngine(),
      to,
      href: '/to',
    });

    jest.spyOn(NavigationTransactionPipeline.prototype, 'runFastPipeline').mockImplementation(async function () {
      transaction.viewCommitTracker.markViewCommitted();
      return { status: 'navigationSucceeded' };
    });

    await transaction.run();
    transaction.cancel();

    expect(revertInFlightView).not.toHaveBeenCalled();
  });
});

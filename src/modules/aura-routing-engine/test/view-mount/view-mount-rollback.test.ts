import {
  collectTransactionRoutes,
  rollbackUncommittedViews,
} from '../../core/view-mount/view-mount-rollback';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationTransaction } from '../../core/navigation-transaction/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation-transaction-pipeline/navigation-transaction-pipeline';
import { ViewCommitTracker } from '../../core/view-mount/view-commit-tracker';
import { createMatchedRoute, createMockEngine } from '../helpers/create-mock-transaction';
import { createTestRoute } from '../helpers/create-test-route';

function createMatchedRouteLocal(
  path: string,
  overrides: Parameters<typeof createTestRoute>[1] = {},
): MatchedRouteInfo {
  return createMatchedRoute(path, overrides);
}

describe('view rollback', () => {
  it('collectTransactionRoutes deduplicates enter and exit branches', () => {
    const route = createTestRoute('/shared');
    const shared: MatchedRouteInfo = {
      href: '/shared',
      pathname: '/shared',
      search: '',
      hash: '',
      pattern: '/shared',
      route: route as MatchedRouteInfo['route'],
    };
    const plan = {
      exitRoutes: [shared],
      enterRoutes: [shared],
      lca: null,
      reenter: false,
    };

    expect(collectTransactionRoutes(plan)).toHaveLength(1);
  });

  it('rollback calls revertInFlightView on affected routes', () => {
    const revertExit = jest.fn();
    const revertEnter = jest.fn();
    const plan = {
      exitRoutes: [createMatchedRouteLocal('/from', { revertInFlightView: revertExit })],
      enterRoutes: [createMatchedRouteLocal('/to', { revertInFlightView: revertEnter })],
      lca: null,
      reenter: false,
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
      enterRoutes: [createMatchedRouteLocal('/to', { revertInFlightView })],
      lca: null,
      reenter: false,
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
    const to = createMatchedRouteLocal('/to', { enter: ['auth'], revertInFlightView });
    const engine = createMockEngine();
    return new NavigationTransaction(
      1,
      0,
      {
        from: null,
        to,
        action: 'push',
        href: '/to',
        hash: '',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );
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
    const to = createMatchedRouteLocal('/to', { revertInFlightView });
    const engine = createMockEngine();
    const transaction = new NavigationTransaction(
      1,
      0,
      {
        from: null,
        to,
        action: 'push',
        href: '/to',
        hash: '',
        options: { replace: false, syncHistory: true },
      },
      () => false,
      engine,
    );

    jest.spyOn(NavigationTransactionPipeline.prototype, 'runFastPipeline').mockImplementation(async function () {
      transaction.viewCommitTracker.markViewCommitted();
      return { status: 'navigationSucceeded' };
    });

    await transaction.run();
    transaction.cancel();

    expect(revertInFlightView).not.toHaveBeenCalled();
  });
});

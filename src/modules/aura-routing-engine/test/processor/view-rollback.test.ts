import { AuraRoutingProcessorJob } from '../../core/processor/cancellation/job';
import { withCancelledTransactionScope } from '../../core/processor/cancellation/transaction-scope';
import {
  collectTransactionRoutes,
  rollbackCancelledNavigation,
} from '../../core/processor/cancellation/view-rollback';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { CommitTracker } from '../../core/view-mount/view-mount-tracker';
import { createTestRoute } from '../helpers/create-test-route';

function createMatchedRoute(
  path: string,
  overrides: Parameters<typeof createTestRoute>[1] = {},
): MatchedRouteInfo {
  return {
    href: path,
    pathname: path,
    search: '',
    hash: '',
    pattern: path,
    route: createTestRoute(path, overrides) as MatchedRouteInfo['route'],
  };
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
      exitRoutes: [createMatchedRoute('/from', { revertInFlightView: revertExit })],
      enterRoutes: [createMatchedRoute('/to', { revertInFlightView: revertEnter })],
      lca: null,
      reenter: false,
    };
    const commitTracker = new CommitTracker('/to');

    rollbackCancelledNavigation(plan, commitTracker);

    expect(revertExit).toHaveBeenCalledTimes(1);
    expect(revertEnter).toHaveBeenCalledTimes(1);
  });

  it('skips rollback after view commit', () => {
    const revertInFlightView = jest.fn();
    const plan = {
      exitRoutes: [],
      enterRoutes: [createMatchedRoute('/to', { revertInFlightView })],
      lca: null,
      reenter: false,
    };
    const commitTracker = new CommitTracker('/to');
    commitTracker.markViewCommitted();

    rollbackCancelledNavigation(plan, commitTracker);

    expect(revertInFlightView).not.toHaveBeenCalled();
  });
});

describe('withCancelledTransactionScope', () => {
  it('rolls back eagerly on job abort', async () => {
    const revertInFlightView = jest.fn();
    const plan = {
      exitRoutes: [],
      enterRoutes: [createMatchedRoute('/to', { revertInFlightView })],
      lca: null,
      reenter: false,
    };
    const job = new AuraRoutingProcessorJob(1);
    const commitTracker = new CommitTracker('/to');

    let resolveRun!: () => void;
    const runPromise = withCancelledTransactionScope({
      plan,
      job,
      commitTracker,
      run: () =>
        new Promise((resolve) => {
          resolveRun = () => resolve({ status: 'cancelled' });
        }),
    });

    job.abort();
    resolveRun();
    await runPromise;

    expect(revertInFlightView).toHaveBeenCalledTimes(1);
  });

  it('rolls back in finally when guard cancels without aborting the job', async () => {
    const revertInFlightView = jest.fn();
    const plan = {
      exitRoutes: [],
      enterRoutes: [createMatchedRoute('/to', { revertInFlightView })],
      lca: null,
      reenter: false,
    };
    const job = new AuraRoutingProcessorJob(1);
    const commitTracker = new CommitTracker('/to');

    await withCancelledTransactionScope({
      plan,
      job,
      commitTracker,
      run: async () => ({ status: 'cancelled' }),
    });

    expect(job.aborted).toBe(false);
    expect(revertInFlightView).toHaveBeenCalledTimes(1);
  });

  it('detaches abort listener when transaction completes without abort', async () => {
    const revertInFlightView = jest.fn();
    const plan = {
      exitRoutes: [],
      enterRoutes: [createMatchedRoute('/to', { revertInFlightView })],
      lca: null,
      reenter: false,
    };
    const job = new AuraRoutingProcessorJob(1);
    const commitTracker = new CommitTracker('/to');
    commitTracker.markViewCommitted();

    await withCancelledTransactionScope({
      plan,
      job,
      commitTracker,
      run: async () => ({ status: 'navigationSucceeded' }),
    });

    job.abort();

    expect(revertInFlightView).not.toHaveBeenCalled();
  });
});

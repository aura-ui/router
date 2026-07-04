import type { RouteInstance } from '../../core';
import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { DataGraph } from '../../core/data-graph';
import { HookRegistry, runPhaseHooks } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { runViewCommit } from '../../core/view-mount/view-commit-render';
import { createTestRoute } from '../helpers/create-test-route';

jest.mock('../../core/hooks/registry', () => ({
  ...jest.requireActual('../../core/hooks/registry'),
  runPhaseHooks: jest.fn(),
}));

jest.mock('../../core/view-mount/view-commit-render', () => ({
  ...jest.requireActual('../../core/view-mount/view-commit-render'),
  runViewCommit: jest.fn(),
}));

const mockRunPhaseHooks = runPhaseHooks as jest.MockedFunction<typeof runPhaseHooks>;
const mockRunViewCommit = runViewCommit as jest.MockedFunction<typeof runViewCommit>;

const PARALLEL_TRANSITION = {
  order: 'parallel' as const,
  in: ['fade'],
  out: ['fade'],
};

function createMatchedRoute(
  path: string,
  overrides: Partial<RouteInstance> = {},
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

function createMockEngine(): AuraRoutingEngine {
  const hookRegistry = new HookRegistry();
  return {
    commitNavigation: jest.fn(),
    finalizeCancelled: jest.fn(),
    dataGraph: new DataGraph(hookRegistry),
    hooksRegistry: hookRegistry,
    router: { navigate: jest.fn() },
    reportNavigationHookError: jest.fn(),
  } as unknown as AuraRoutingEngine;
}

function createTransaction(options: {
  from: MatchedRouteInfo;
  to: MatchedRouteInfo;
  isTransactionStale?: () => boolean;
}): NavigationTransaction {
  const engine = createMockEngine();
  const transaction = new NavigationTransaction(
    1,
    0,
    {
      from: options.from,
      to: options.to,
      action: 'push',
      href: options.to.href,
      hash: '',
      options: { replace: false, syncHistory: true },
    },
    () => options.isTransactionStale?.() ?? false,
    engine,
  );

  transaction.transitionPlan = {
    exitRoutes: [options.from],
    enterRoutes: [options.to],
    lca: null,
    reenter: false,
  };
  transaction.transitionOrder = 'parallel';

  return transaction;
}

describe('NavigationTransaction.isActive', () => {
  it('is false after cancel even when the transaction was not superseded', () => {
    const from = createMatchedRoute('/about');
    const to = createMatchedRoute('/gallery');
    const transaction = createTransaction({ from, to });

    expect(transaction.isActive()).toBe(true);
    expect(transaction.isStale()).toBe(false);

    transaction.cancel();

    expect(transaction.isAborted).toBe(true);
    expect(transaction.isStale()).toBe(false);
    expect(transaction.isActive()).toBe(false);
  });
});

describe('NavigationTransactionPipeline cancel-pending (A → B in-flight → A)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunViewCommit.mockResolvedValue('ok');
    mockRunPhaseHooks.mockResolvedValue(undefined);
  });

  it('skips commit and left when aborted after parallel transitions without supersede', async () => {
    const commitStagedView = jest.fn();
    const onUnmount = jest.fn();
    const from = createMatchedRoute('/about', {
      onUnmount,
      transition: PARALLEL_TRANSITION,
      transitionOut: ['fade'],
    });
    const to = createMatchedRoute('/gallery', {
      commitStagedView,
      transition: PARALLEL_TRANSITION,
      transitionIn: ['fade'],
    });
    const transaction = createTransaction({ from, to });

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
    const transaction = createTransaction({ from, to });

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

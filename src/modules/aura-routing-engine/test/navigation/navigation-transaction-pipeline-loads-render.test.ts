jest.mock('../../core/hooks/registry', () =>
  require('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  require('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import { PHASES } from '../../core/navigation/livecycle-phases';
import type { DataSnapshot } from '../../core/data-graph';
import { buildRouteDataKey } from '../../core/data-graph/route-data';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { createMatchedRoute, createMockTransaction } from '../helpers/create-mock-transaction';
import { mockRunPhaseHooks, mockRunViewCommit, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

describe('NavigationTransactionPipeline phase hook attrs', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('runs hooks from phase attrs on matching phase', async () => {
    const phases: string[] = [];
    mockRunPhaseHooks.mockImplementation(async (_registry, ctx) => {
      phases.push(ctx.phase);
    });

    const transaction = createMockTransaction({
      transitionOrder: null,
      exitRoutes: [createMatchedRoute('/from', { unmount: ['cleanup'] })],
      enterRoutes: [createMatchedRoute('/to', { transitionIn: ['fade-in'] })],
    });

    await new NavigationTransactionPipeline(transaction).runLifecyclePhase(PHASES.unmount);

    expect(phases).toEqual(['unmount']);
  });
});

describe('NavigationTransactionPipeline viewCommitOptions data', () => {
  beforeEach(() => {
    resetPipelineMocks();
    mockRunViewCommit.mockResolvedValue('ok');
  });

  it('passes load-hook data from dataSnapshot to runViewCommit', async () => {
    const enterRoute = createMatchedRoute('/to', {
      load: ['fetch'],
      hasLoad: true,
      mountStrategy: 'per-route',
    });
    const loadPayload = { items: [1, 2] };
    const snapshot = new Map([
      [buildRouteDataKey(enterRoute, ['fetch']), loadPayload],
    ]) as DataSnapshot;

    const transaction = createMockTransaction({
      enterRoutes: [enterRoute],
      transitionOrder: null,
    });
    transaction.dataSnapshot = snapshot;

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(mockRunViewCommit).toHaveBeenCalledWith(
      enterRoute,
      expect.objectContaining({ isAborted: expect.any(Function) }),
      { data: loadPayload },
    );
  });
});

describe('NavigationTransactionPipeline.runLoads activeChain', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('prefers to.chain over enterRoutes when calling DataGraph.load', async () => {
    const parent = createMatchedRoute('/users');
    const child = createMatchedRoute('/users/1');
    const activeChain = [parent, child];

    const transaction = createMockTransaction({
      enterRoutes: [child],
      transitionOrder: null,
    });
    transaction.to = { ...child, chain: activeChain };

    const loadSpy = jest
      .spyOn(transaction.engine.dataGraph, 'load')
      .mockResolvedValue({ outcome: null, snapshot: undefined });

    await new NavigationTransactionPipeline(transaction).runLoads();

    expect(loadSpy).toHaveBeenCalledWith(
      [child],
      expect.objectContaining({ activeChain, transaction }),
    );

    loadSpy.mockRestore();
  });
});

describe('NavigationTransactionPipeline per-route render cancellation', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  it('passes live isAborted check to runViewCommit during per-route render', async () => {
    mockRunViewCommit.mockImplementation(async (_route, cancellation) => {
      expect(cancellation.isAborted()).toBe(false);
      return 'ok';
    });

    const transaction = createMockTransaction({
      enterRoutes: [createMatchedRoute('/page', { mountStrategy: 'per-route' })],
      transitionOrder: null,
    });

    await new NavigationTransactionPipeline(transaction).runRender();

    expect(mockRunViewCommit).toHaveBeenCalledTimes(1);
  });

  it('returns cancelled when superseded between per-route commits', async () => {
    let active = true;
    mockRunViewCommit.mockImplementation(async () => {
      active = false;
      return 'ok';
    });

    const transaction = createMockTransaction({
      enterRoutes: [
        createMatchedRoute('/a', { mountStrategy: 'per-route' }),
        createMatchedRoute('/b', { mountStrategy: 'per-route' }),
      ],
      transitionOrder: null,
    });
    jest.spyOn(transaction, 'isActive').mockImplementation(() => active);

    const outcome = await new NavigationTransactionPipeline(transaction).runRender();

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(mockRunViewCommit).toHaveBeenCalledTimes(1);
  });
});

jest.mock('../../core/hooks/registry', () =>
  jest.requireActual('../helpers/jest/mock-hooks-registry').mockHooksRegistry());
jest.mock('../../core/view-mount/view-commit-render', () =>
  jest.requireActual('../helpers/jest/mock-view-commit-render').mockViewCommitRender());

import type { EngineEvent } from '../../core/events';
import { NavigationFailure } from '../../core/failure';
import { NavigationError } from '../../core/failure/navigation-error';
import { NavigationCoordinator } from '../../core/navigation/navigation-coordinator';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import {
  createCoordinatorMockHost,
  createMatchedRoute,
  createMockTransaction,
} from '../helpers/create-mock-transaction';
import { createPushNavOptions } from '../helpers/jest/navigation-fixtures';
import { mockRunViewCommit, resetPipelineMocks } from '../helpers/jest/pipeline-mocks';

function eventTypes(events: EngineEvent[]): EngineEvent['type'][] {
  return events.map((event) => event.type);
}

describe('EventBus pipeline emits (EB1)', () => {
  beforeEach(() => {
    resetPipelineMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('full pipeline emits prepare / load / commit:start', async () => {
    const seen: EngineEvent[] = [];
    const from = createMatchedRoute('/from');
    const to = createMatchedRoute('/to');
    const transaction = createMockTransaction({
      from,
      exitRoutes: [from],
      enterRoutes: [to],
      transitionOrder: null,
    });
    transaction.engine.events.subscribe((event) => seen.push(event));

    const result = await new NavigationTransactionPipeline(transaction).runFullPipeline();

    expect(result).toEqual({ status: 'navigationSucceeded' });
    expect(eventTypes(seen)).toEqual([
      'navigation:prepare:start',
      'load:start',
      'load:end',
      'navigation:prepare:end',
      'navigation:commit:start',
    ]);
  });

  it('transaction.run emits start and node:deactivate before pipeline', async () => {
    const seen: EngineEvent[] = [];
    const from = createMatchedRoute('/from');
    const to = createMatchedRoute('/to');
    const transaction = createMockTransaction({
      from,
      exitRoutes: [from],
      enterRoutes: [to],
      transitionOrder: null,
    });
    transaction.engine.events.subscribe((event) => seen.push(event));

    jest.spyOn(NavigationTransactionPipeline.prototype, 'runFullPipeline')
      .mockResolvedValue({ status: 'navigationSucceeded' });
    jest.spyOn(NavigationTransactionPipeline.prototype, 'runFastPipeline')
      .mockResolvedValue({ status: 'navigationSucceeded' });
    jest.spyOn(NavigationTransactionPipeline.prototype, 'runUpdate')
      .mockResolvedValue({ status: 'navigationSucceeded' });

    await transaction.run();

    expect(eventTypes(seen).slice(0, 2)).toEqual([
      'navigation:start',
      'node:deactivate',
    ]);
    expect(seen[0]).toMatchObject({
      type: 'navigation:start',
      id: 1,
      from,
      to,
      action: 'push',
    });
    expect(seen[1]).toMatchObject({
      type: 'node:deactivate',
      nodeId: '/from',
      pattern: '/from',
    });
  });

  it('fast path skips prepare and load', async () => {
    mockRunViewCommit.mockResolvedValue('ok');
    const seen: EngineEvent[] = [];
    const transaction = createMockTransaction({
      from: createMatchedRoute('/a'),
      enterRoutes: [createMatchedRoute('/b')],
      transitionOrder: null,
    });
    transaction.engine.events.subscribe((event) => seen.push(event));

    await new NavigationTransactionPipeline(transaction).runFastPipeline();

    expect(eventTypes(seen)).toEqual(['navigation:commit:start']);
  });

  it('coordinator emits finish after successful run', async () => {
    const host = createCoordinatorMockHost();
    const coordinator = new NavigationCoordinator(host);
    const seen: EngineEvent[] = [];
    host.engine.events.subscribe((event) => seen.push(event));

    jest.spyOn(NavigationTransaction.prototype, 'run')
      .mockResolvedValue({ status: 'navigationSucceeded' });

    await coordinator.run(
      createPushNavOptions({
        from: createMatchedRoute('/a'),
        to: createMatchedRoute('/b'),
        href: '/b',
      }),
    );

    expect(eventTypes(seen)).toEqual(['navigation:finish']);
  });

  it('coordinator emits cancel for cancelled run', async () => {
    const host = createCoordinatorMockHost();
    const coordinator = new NavigationCoordinator(host);
    const seen: EngineEvent[] = [];
    host.engine.events.subscribe((event) => seen.push(event));

    jest.spyOn(NavigationTransaction.prototype, 'run')
      .mockResolvedValue({ status: 'cancelled' });

    await coordinator.run(
      createPushNavOptions({
        from: createMatchedRoute('/a'),
        to: createMatchedRoute('/b'),
        href: '/b',
      }),
    );

    expect(eventTypes(seen)).toEqual(['navigation:cancel']);
    expect(host.applyTerminalOutcome).toHaveBeenCalledWith(
      { status: 'cancelled' },
      expect.objectContaining({ href: '/b' }),
    );
  });

  it('coordinator emits redirect and error terminals', async () => {
    const host = createCoordinatorMockHost();
    const coordinator = new NavigationCoordinator(host);
    const seen: EngineEvent[] = [];
    host.engine.events.subscribe((event) => seen.push(event));

    const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');
    const to = createMatchedRoute('/b');
    const from = createMatchedRoute('/a');

    runSpy.mockResolvedValueOnce({ status: 'redirect', url: '/next', replace: true });
    await coordinator.run(createPushNavOptions({ from, to, href: '/b' }));

    const failure = NavigationFailure.fromPipeline(
      new NavigationError({
        code: 'LOAD_FAILED',
        phase: 'load',
        routePattern: to.pattern,
        message: 'boom',
      }),
      { view: 'none', href: to.href },
      from,
      to,
      'push',
    );
    runSpy.mockResolvedValueOnce({ status: 'error', failure });
    await coordinator.run(
      createPushNavOptions({
        from,
        to: createMatchedRoute('/c'),
        href: '/c',
      }),
    );

    expect(eventTypes(seen)).toEqual(['navigation:redirect', 'navigation:error']);
    expect(seen[0]).toMatchObject({
      type: 'navigation:redirect',
      url: '/next',
      replace: true,
    });
    expect(seen[1]).toMatchObject({ type: 'navigation:error', failure });
  });
});

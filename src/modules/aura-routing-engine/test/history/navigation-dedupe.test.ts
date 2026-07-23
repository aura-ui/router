import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import type { TransactionResult } from '../../core/navigation/types';
import { createTestRoute } from '../_helpers/create-test-route';

function mockTransactionRunSuccess(run: jest.SpyInstance): void {
  run.mockImplementation(async function (this: NavigationTransaction) {
    this.engine.commitNavigation(this);
    return { status: 'navigationSucceeded' };
  });
}

function resolveMockTransactionRun(
  transaction: NavigationTransaction,
  resolve: (result: TransactionResult) => void,
  result: TransactionResult,
): void {
  if (!result || result.status === 'navigationSucceeded') {
    transaction.engine.commitNavigation(transaction);
  }
  resolve(result);
}

function mockDeferredTransactionRun() {
  const resolvers: Array<(result: TransactionResult) => void> = [];
  const transactions: NavigationTransaction[] = [];

  const run = jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(
    function (this: NavigationTransaction) {
      transactions.push(this);
      return new Promise<TransactionResult>((resolve) => {
        resolvers.push((result) => resolveMockTransactionRun(this, resolve, result));
      });
    },
  );

  return {
    run,
    resolveAt(index: number, result: TransactionResult) {
      resolvers[index]!(result);
    },
    transactionAt(index: number) {
      return transactions[index];
    },
  };
}

async function waitForRunCalls(run: jest.SpyInstance, expected: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (run.mock.calls.length >= expected) return;
    await Promise.resolve();
  }
  expect(run).toHaveBeenCalledTimes(expected);
}

describe('AuraRoutingEngine navigation dedupe', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  beforeEach(() => {
    jest.spyOn(NavigationTransaction.prototype, 'runRedirectCollapse').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores duplicate navigateTo calls while the same target is in flight', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    engine.registerRoutes([createTestRoute('/'), createTestRoute('/about')]);
    provider.start();

    mockTransactionRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });

    const { resolveAt } = mockDeferredTransactionRun();
    run.mockClear();

    const first = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });
    const second = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    await waitForRunCalls(run, 1);

    resolveAt(0, { status: 'navigationSucceeded' });
    await first;
    await second;
  });

  it('aborts pending navigation when the committed route is clicked again', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');
    const cancel = jest.spyOn(NavigationTransaction.prototype, 'cancel');

    engine.registerRoutes([
      createTestRoute('/'),
      createTestRoute('/about'),
      createTestRoute('/gallery'),
    ]);
    provider.start();

    mockTransactionRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    const { resolveAt } = mockDeferredTransactionRun();
    run.mockClear();
    cancel.mockClear();

    const galleryNav = engine.navigateTo('/gallery', 'push', { replace: false, syncHistory: true });
    await waitForRunCalls(run, 1);

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(cancel).toHaveBeenCalledTimes(1);

    resolveAt(0, { status: 'cancelled' });
    await galleryNav;
  });

  it('skips transaction when the committed route declares update hooks', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    engine.registerRoutes([
      createTestRoute('/'),
      createTestRoute('/about', { update: ['sync'] }),
    ]);
    provider.start();

    mockTransactionRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    run.mockClear();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('skips transaction when the committed route has no update hooks', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    engine.registerRoutes([createTestRoute('/'), createTestRoute('/about')]);
    provider.start();

    mockTransactionRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    run.mockClear();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('still navigates when the in-flight target changes', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    engine.registerRoutes([
      createTestRoute('/'),
      createTestRoute('/about'),
      createTestRoute('/gallery'),
    ]);
    provider.start();

    mockTransactionRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    run.mockClear();

    const aboutNav = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });
    const galleryNav = engine.navigateTo('/gallery', 'push', { replace: false, syncHistory: true });

    await waitForRunCalls(run, 1);
    expect(run.mock.contexts[0]?.href).toBe('/gallery');

    await aboutNav;
    await galleryNav;
  });

  it('skips coordinator when superseded resolve completes after abort', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    engine.registerRoutes([
      createTestRoute('/'),
      createTestRoute('/about'),
      createTestRoute('/gallery'),
    ]);
    provider.start();

    mockTransactionRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    run.mockClear();

    jest.spyOn(NavigationTransaction.prototype, 'runRedirectCollapse').mockImplementationOnce(
      async function (this: NavigationTransaction) {
        await Promise.resolve();
        await Promise.resolve();
        if (!this.isActive()) {
          return { status: 'cancelled' };
        }
        return null;
      },
    );

    const aboutNav = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });
    const galleryNav = engine.navigateTo('/gallery', 'push', { replace: false, syncHistory: true });

    await waitForRunCalls(run, 1);
    expect(run.mock.contexts[0]?.href).toBe('/gallery');

    await aboutNav;
    expect(run).toHaveBeenCalledTimes(1);
    await galleryNav;
  });
});

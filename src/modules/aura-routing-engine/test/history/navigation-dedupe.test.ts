import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import { NavigationTransaction } from '../../core/navigation-transaction/navigation-transaction';
import type { TransactionFullResult } from '../../core/navigation-transaction-pipeline/navigation-transaction-pipeline';
import { createTestRoute } from '../helpers/create-test-route';

function mockTransactionRunSuccess(run: jest.SpyInstance): void {
  run.mockImplementation(async function (this: NavigationTransaction) {
    this.engine.commitNavigation(this);
    return { status: 'navigationSucceeded' };
  });
}

function resolveMockTransactionRun(
  transaction: NavigationTransaction,
  resolve: (result: TransactionFullResult) => void,
  result: TransactionFullResult,
): void {
  if (!result || result.status === 'navigationSucceeded') {
    transaction.engine.commitNavigation(transaction);
  }
  resolve(result);
}

function mockDeferredTransactionRun() {
  const resolvers: Array<(result: TransactionFullResult) => void> = [];
  const transactions: NavigationTransaction[] = [];

  const run = jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(
    function (this: NavigationTransaction) {
      transactions.push(this);
      return new Promise<TransactionFullResult>((resolve) => {
        resolvers.push((result) => resolveMockTransactionRun(this, resolve, result));
      });
    },
  );

  return {
    run,
    resolveAt(index: number, result: TransactionFullResult) {
      resolvers[index](result);
    },
    transactionAt(index: number) {
      return transactions[index];
    },
  };
}

describe('AuraRoutingEngine navigation dedupe', () => {
  const router: RouterInstance = { navigate: jest.fn() };

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

    expect(run).toHaveBeenCalledTimes(1);

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
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);

    resolveAt(0, { status: 'cancelled' });
    await galleryNav;
  });

  it('runs transaction when the committed route declares reenter hooks', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    engine.registerRoutes([
      createTestRoute('/'),
      createTestRoute('/about', { reenter: ['sync'] }),
    ]);
    provider.start();

    mockTransactionRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    run.mockClear();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips transaction when the committed route has no reenter hooks', async () => {
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

    let resolveAbout!: (result: TransactionFullResult) => void;
    let call = 0;
    run.mockImplementation(async function (this: NavigationTransaction) {
      call += 1;
      if (call === 1) {
        return new Promise<TransactionFullResult>((resolve) => {
          resolveAbout = (result) => resolveMockTransactionRun(this, resolve, result);
        });
      }
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });
    run.mockClear();
    call = 0;

    const aboutNav = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });
    const galleryNav = engine.navigateTo('/gallery', 'push', { replace: false, syncHistory: true });

    expect(run).toHaveBeenCalledTimes(2);

    resolveAbout({ status: 'cancelled' });
    await aboutNav;
    await galleryNav;
  });
});

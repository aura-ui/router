import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { createTestRoute } from '../_helpers/create-test-route';
import { bootEngine, createEngineHarness } from '../_helpers/engine-harness';
import {
  mockDeferredTransactionRun,
  mockTransactionRunSuccess,
  waitForRunCalls,
} from '../_helpers/jest/navigation-fixtures';

describe('AuraRoutingEngine navigation dedupe', () => {
  beforeEach(() => {
    jest.spyOn(NavigationTransaction.prototype, 'runRedirectCollapse').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores duplicate navigateTo calls while the same target is in flight', async () => {
    const { engine } = createEngineHarness({
      routes: [createTestRoute('/'), createTestRoute('/about')],
    });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    mockTransactionRunSuccess(run);
    await bootEngine(engine, '/');

    const { resolveAt } = mockDeferredTransactionRun({
      captureTransactions: true,
      commitOnSuccess: true,
    });
    run.mockClear();

    const first = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });
    const second = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    await waitForRunCalls(run, 1);

    resolveAt(0, { status: 'navigationSucceeded' });
    await first;
    await second;
  });

  it('aborts pending navigation when the committed route is clicked again', async () => {
    const { engine } = createEngineHarness({
      routes: [
        createTestRoute('/'),
        createTestRoute('/about'),
        createTestRoute('/gallery'),
      ],
    });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');
    const cancel = jest.spyOn(NavigationTransaction.prototype, 'cancel');

    mockTransactionRunSuccess(run);
    await bootEngine(engine, '/');
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    const { resolveAt } = mockDeferredTransactionRun({
      captureTransactions: true,
      commitOnSuccess: true,
    });
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
    const { engine } = createEngineHarness({
      routes: [
        createTestRoute('/'),
        createTestRoute('/about', { update: ['sync'] }),
      ],
    });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    mockTransactionRunSuccess(run);
    await bootEngine(engine, '/');
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    run.mockClear();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('skips transaction when the committed route has no update hooks', async () => {
    const { engine } = createEngineHarness({
      routes: [createTestRoute('/'), createTestRoute('/about')],
    });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    mockTransactionRunSuccess(run);
    await bootEngine(engine, '/');
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    run.mockClear();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('still navigates when the in-flight target changes', async () => {
    const { engine } = createEngineHarness({
      routes: [
        createTestRoute('/'),
        createTestRoute('/about'),
        createTestRoute('/gallery'),
      ],
    });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    mockTransactionRunSuccess(run);
    await bootEngine(engine, '/');
    run.mockClear();

    const aboutNav = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });
    const galleryNav = engine.navigateTo('/gallery', 'push', { replace: false, syncHistory: true });

    await waitForRunCalls(run, 1);
    expect(run.mock.contexts[0]?.href).toBe('/gallery');

    await aboutNav;
    await galleryNav;
  });

  it('skips coordinator when superseded resolve completes after abort', async () => {
    const { engine } = createEngineHarness({
      routes: [
        createTestRoute('/'),
        createTestRoute('/about'),
        createTestRoute('/gallery'),
      ],
    });
    const run = jest.spyOn(NavigationTransaction.prototype, 'run');

    mockTransactionRunSuccess(run);
    await bootEngine(engine, '/');
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

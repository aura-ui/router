import {
  AuraRoutingEngine,
  AuraRoutingProcessor,
  FakeHistoryProvider,
} from '../../core';
import type { RouterInstance } from '../../core';
import type { TransactionResult } from '../../core/navigation/transaction-result';
import type { ProcessorRunInput } from '../../core/processor/types';
import { createTestRoute } from '../helpers/create-test-route';
import { mockProcessorRunSuccess, resolveMockProcessorRun } from '../helpers/mock-processor-run';

describe('AuraRoutingEngine navigation dedupe', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores duplicate navigateTo calls while the same target is pending', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, { provider });
    const run = jest.spyOn(AuraRoutingProcessor.prototype, 'run');

    engine.registerRoutes([createTestRoute('/'), createTestRoute('/about')]);
    provider.start();

    mockProcessorRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });

    let resolveRun!: (result: TransactionResult) => void;
    run.mockImplementation(
      (input: ProcessorRunInput) =>
        new Promise<TransactionResult>((resolve) => {
          resolveRun = (result) => resolveMockProcessorRun(input, resolve, result);
        }),
    );
    run.mockClear();

    const first = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });
    const second = engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).toHaveBeenCalledTimes(1);

    resolveRun({ status: 'navigationSucceeded' });
    await first;
    await second;
  });

  it('aborts pending navigation when the committed route is clicked again', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, { provider });
    const run = jest.spyOn(AuraRoutingProcessor.prototype, 'run');
    const abort = jest.spyOn(AuraRoutingProcessor.prototype, 'abortPendingNavigation');

    engine.registerRoutes([
      createTestRoute('/'),
      createTestRoute('/about'),
      createTestRoute('/gallery'),
    ]);
    provider.start();

    mockProcessorRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    let resolveGallery!: (result: TransactionResult) => void;
    run.mockImplementation(
      (input: ProcessorRunInput) =>
        new Promise<TransactionResult>((resolve) => {
          resolveGallery = (result) => resolveMockProcessorRun(input, resolve, result);
        }),
    );
    run.mockClear();
    abort.mockClear();

    const galleryNav = engine.navigateTo('/gallery', 'push', { replace: false, syncHistory: true });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledTimes(1);

    resolveGallery({ status: 'cancelled' });
    await galleryNav;
  });

  it('runs processor when the committed route declares reenter hooks', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, { provider });
    const run = jest.spyOn(AuraRoutingProcessor.prototype, 'run');

    engine.registerRoutes([
      createTestRoute('/', {}),
      createTestRoute('/about', { hooks: { reenter: ['sync'] } }),
    ]);
    provider.start();
    mockProcessorRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    run.mockClear();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips processor when the committed route has no reenter hooks', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, { provider });
    const run = jest.spyOn(AuraRoutingProcessor.prototype, 'run');

    engine.registerRoutes([createTestRoute('/'), createTestRoute('/about')]);
    provider.start();
    mockProcessorRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    run.mockClear();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('still navigates when the in-flight target changes', async () => {
    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(new AuraRoutingProcessor(), router, { provider });
    const run = jest.spyOn(AuraRoutingProcessor.prototype, 'run');

    engine.registerRoutes([
      createTestRoute('/'),
      createTestRoute('/about'),
      createTestRoute('/gallery'),
    ]);
    provider.start();

    mockProcessorRunSuccess(run);
    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });

    let resolveAbout!: (result: TransactionResult) => void;
    let call = 0;
    run.mockImplementation((input: ProcessorRunInput) => {
      call += 1;
      if (call === 1) {
        return new Promise<TransactionResult>((resolve) => {
          resolveAbout = (result) => resolveMockProcessorRun(input, resolve, result);
        });
      }
      return Promise.resolve({ status: 'navigationSucceeded' }).then((result) => {
        input.commitGate?.();
        return result;
      });
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

import type { RouteInstance } from '../../core';
import { AuraRoutingEngine } from '../../core/aura-routing-engine';
import { DataGraph } from '../../core/data-graph';
import { FailedNavigation } from '../../core/failure';
import { HookRegistry } from '../../core/hooks/registry';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import {
  NavigationCoordinator,
  type NavigationTransactionOptions,
} from '../../core/navigation-coordinator/navigation-coordinator';
import { NavigationTransaction } from '../../core/navigation-transaction/navigation-transaction';
import type { TransactionFullResult } from '../../core/navigation-transaction-pipeline/navigation-transaction-pipeline';
import { createTestRoute } from '../helpers/create-test-route';

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
    applyRedirect: jest.fn(),
    finalizeError: jest.fn(),
    dataGraph: new DataGraph(hookRegistry),
    hooksRegistry: hookRegistry,
    router: { navigate: jest.fn() },
    reportNavigationHookError: jest.fn(),
  } as unknown as AuraRoutingEngine;
}

function navOptions(
  input: Pick<NavigationTransactionOptions, 'from' | 'to' | 'href'>,
): NavigationTransactionOptions {
  return {
    action: 'push',
    hash: '',
    options: { replace: false, syncHistory: true },
    ...input,
  };
}

function mockDeferredTransactionRun() {
  const resolvers: Array<(result: TransactionFullResult) => void> = [];

  const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(
    () =>
      new Promise<TransactionFullResult>((resolve) => {
        resolvers.push(resolve);
      }),
  );

  return {
    runSpy,
    resolveAt(index: number, result: TransactionFullResult) {
      resolvers[index](result);
    },
    pendingCount: () => resolvers.length,
  };
}

describe('NavigationCoordinator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('planning — noop', () => {
    it('skips when the committed route is already active', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about');
      const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');

      await coordinator.run(navOptions({ from: about, to: about, href: '/about' }));

      expect(runSpy).not.toHaveBeenCalled();
      expect(coordinator.currentTransaction).toBeNull();
      expect(coordinator.pendingHref).toBeNull();
    });

    it('ignores duplicate href while pending', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();

      const first = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const second = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.pendingHref).toBe('/about');

      resolveAt(0, { status: 'navigationSucceeded' });
      await first;
      await second;

      expect(coordinator.pendingHref).toBeNull();
    });

    it('runs the first navigation when from is null', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about');
      const runSpy = jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });

      await coordinator.run(navOptions({ from: null, to: about, href: '/about' }));

      expect(runSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('planning — cancel-pending', () => {
    it('aborts in-flight navigation without starting a new transaction', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      const galleryNav = coordinator.run(navOptions({ from: about, to: gallery, href: '/gallery' }));

      await coordinator.run(navOptions({ from: about, to: about, href: '/about' }));

      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.currentTransaction).toBeNull();
      expect(coordinator.pendingHref).toBe('/gallery');

      resolveAt(0, { status: 'cancelled' });
      await galleryNav;

      expect(engine.finalizeCancelled).toHaveBeenCalledTimes(1);
      expect(coordinator.pendingHref).toBeNull();
    });

    it('returns noop when pending href differs but no transaction is active', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about');
      const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      coordinator.markPending('/gallery');
      coordinator.currentTransaction = null;

      await coordinator.run(navOptions({ from: about, to: about, href: '/about' }));

      expect(runSpy).not.toHaveBeenCalled();
      expect(cancelSpy).not.toHaveBeenCalled();
      expect(coordinator.pendingHref).toBe('/gallery');
    });
  });

  describe('planning — run', () => {
    it('runs when the committed route declares reenter hooks', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about', { reenter: ['sync'] });
      const runSpy = jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });

      await coordinator.run(navOptions({ from: about, to: about, href: '/about' }));

      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it('runs navigation to a different href while another target is pending', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      const aboutNav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const galleryNav = coordinator.run(navOptions({ from: home, to: gallery, href: '/gallery' }));

      expect(runSpy).toHaveBeenCalledTimes(2);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.pendingHref).toBe('/gallery');

      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await aboutNav;
      await galleryNav;

      expect(engine.finalizeCancelled).toHaveBeenCalledTimes(1);
      expect(coordinator.pendingHref).toBeNull();
      expect(coordinator.currentTransaction).toBeNull();
    });

    it('does not clear a newer currentTransaction when a superseded run settles', async () => {
      const coordinator = new NavigationCoordinator(createMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { resolveAt } = mockDeferredTransactionRun();

      const aboutNav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const galleryNav = coordinator.run(navOptions({ from: home, to: gallery, href: '/gallery' }));
      const secondTransaction = coordinator.currentTransaction;

      resolveAt(0, { status: 'cancelled' });
      await aboutNav;

      expect(coordinator.currentTransaction).toBe(secondTransaction);

      resolveAt(1, { status: 'navigationSucceeded' });
      await galleryNav;

      expect(coordinator.currentTransaction).toBeNull();
    });
  });

  describe('execution outcomes', () => {
    it('clears pending and currentTransaction after navigationSucceeded', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');

      jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });

      await coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(coordinator.pendingHref).toBeNull();
      expect(coordinator.currentTransaction).toBeNull();
      expect(engine.finalizeCancelled).not.toHaveBeenCalled();
      expect(engine.applyRedirect).not.toHaveBeenCalled();
      expect(engine.finalizeError).not.toHaveBeenCalled();
    });

    it('calls finalizeCancelled on cancelled result', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');

      jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'cancelled' });

      await coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(engine.finalizeCancelled).toHaveBeenCalledTimes(1);
      expect(engine.finalizeCancelled).toHaveBeenCalledWith(
        expect.objectContaining({ href: '/about' }),
      );
      expect(coordinator.pendingHref).toBeNull();
      expect(coordinator.currentTransaction).toBeNull();
    });

    it('calls applyRedirect on redirect result', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const redirect = { status: 'redirect' as const, url: '/login', replace: true };

      jest.spyOn(NavigationTransaction.prototype, 'run').mockResolvedValue(redirect);

      await coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(engine.applyRedirect).toHaveBeenCalledTimes(1);
      expect(engine.applyRedirect).toHaveBeenCalledWith(
        redirect,
        expect.objectContaining({ href: '/about' }),
      );
      expect(coordinator.pendingHref).toBeNull();
    });

    it('calls finalizeError on error result', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const error = {
        status: 'error' as const,
        failure: FailedNavigation.notFound('/about', home, 'push'),
      };

      jest.spyOn(NavigationTransaction.prototype, 'run').mockResolvedValue(error);

      await coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(engine.finalizeError).toHaveBeenCalledTimes(1);
      expect(engine.finalizeError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ href: '/about' }),
      );
      expect(coordinator.pendingHref).toBeNull();
    });

    it('treats null pipeline result as success', async () => {
      const engine = createMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');

      jest.spyOn(NavigationTransaction.prototype, 'run').mockResolvedValue(null);

      await coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(engine.finalizeCancelled).not.toHaveBeenCalled();
      expect(engine.applyRedirect).not.toHaveBeenCalled();
      expect(engine.finalizeError).not.toHaveBeenCalled();
      expect(coordinator.pendingHref).toBeNull();
    });
  });

  describe('pending lifecycle', () => {
    it('clears pending only for the matching href', () => {
      const coordinator = new NavigationCoordinator(createMockEngine());

      coordinator.markPending('/about');
      coordinator.clearPending('/gallery');

      expect(coordinator.pendingHref).toBe('/about');

      coordinator.clearPending('/about');
      expect(coordinator.pendingHref).toBeNull();
    });

    it('keeps pending until the in-flight run settles', async () => {
      const coordinator = new NavigationCoordinator(createMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(coordinator.pendingHref).toBe('/about');

      resolveAt(0, { status: 'navigationSucceeded' });
      await nav;

      expect(coordinator.pendingHref).toBeNull();
    });
  });

  describe('transactionRejected', () => {
    it('is false for the active transaction', async () => {
      const coordinator = new NavigationCoordinator(createMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const transaction = coordinator.currentTransaction!;

      expect(coordinator.transactionRejected(transaction.id, 0)).toBe(false);
      expect(transaction.transactionRejected()).toBe(false);

      resolveAt(0, { status: 'navigationSucceeded' });
      await nav;
    });

    it('becomes true after a newer navigation supersedes', async () => {
      const coordinator = new NavigationCoordinator(createMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { resolveAt } = mockDeferredTransactionRun();

      const aboutNav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const firstTransaction = coordinator.currentTransaction!;
      const firstId = firstTransaction.id;

      const galleryNav = coordinator.run(navOptions({ from: home, to: gallery, href: '/gallery' }));

      expect(coordinator.transactionRejected(firstId, 0)).toBe(true);
      expect(firstTransaction.transactionRejected()).toBe(true);

      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await aboutNav;
      await galleryNav;
    });

    it('becomes true after invalidate', async () => {
      const coordinator = new NavigationCoordinator(createMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const transaction = coordinator.currentTransaction!;

      coordinator.invalidate();

      expect(coordinator.transactionRejected(transaction.id, 0)).toBe(true);
      expect(transaction.transactionRejected()).toBe(true);

      resolveAt(0, { status: 'cancelled' });
      await nav;
    });
  });

  describe('invalidate', () => {
    it('cancels the current transaction', async () => {
      const coordinator = new NavigationCoordinator(createMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const transaction = coordinator.currentTransaction!;

      coordinator.invalidate();

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(transaction.aborted).toBe(true);

      resolveAt(0, { status: 'cancelled' });
      await nav;
    });

    it('is safe when no transaction is active', () => {
      const coordinator = new NavigationCoordinator(createMockEngine());
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      coordinator.invalidate();

      expect(cancelSpy).not.toHaveBeenCalled();
      expect(coordinator.transactionRejected(1, 0)).toBe(true);
    });
  });
});

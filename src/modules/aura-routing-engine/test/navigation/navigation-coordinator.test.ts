import { FailedNavigation } from '../../core/failure';
import {
  NavigationCoordinator,
  type NavigationTransactionOptions,
} from '../../core/navigation/navigation-coordinator';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import {
  createCoordinatorMockEngine,
  createMatchedRoute,
} from '../helpers/create-mock-transaction';
import {
  createPushNavOptions,
  mockDeferredTransactionRun,
} from '../helpers/jest/navigation-fixtures';
import { createUsersIdMatch, createUsersIdNode } from '../helpers/create-dynamic-leaf-match';

function navOptions(
  input: Pick<NavigationTransactionOptions, 'from' | 'to' | 'href'>,
): NavigationTransactionOptions {
  return createPushNavOptions(input);
}

describe('NavigationCoordinator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('planning — noop', () => {
    it('skips when the committed route is already active', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about');
      const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');

      await coordinator.run(navOptions({ from: about, to: about, href: '/about' }));

      expect(runSpy).not.toHaveBeenCalled();
      expect(coordinator.activeTransaction).toBeNull();
      expect(coordinator.inFlightHref).toBeNull();
    });

    it('ignores duplicate href while in flight', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();

      const first = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const second = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.inFlightHref).toBe('/about');

      resolveAt(0, { status: 'navigationSucceeded' });
      await first;
      await second;

      expect(coordinator.inFlightHref).toBeNull();
    });

    it('runs the first navigation when from is null', async () => {
      const engine = createCoordinatorMockEngine();
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
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      const galleryNav = coordinator.run(navOptions({ from: about, to: gallery, href: '/gallery' }));

      await coordinator.run(navOptions({ from: about, to: about, href: '/about' }));

      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.activeTransaction).toBeNull();
      expect(coordinator.inFlightHref).toBe('/gallery');

      resolveAt(0, { status: 'cancelled' });
      await galleryNav;

      expect(engine.finalizeCancelled).toHaveBeenCalledTimes(1);
      expect(coordinator.inFlightHref).toBeNull();
    });

    it('is a no-op when only inFlightHref remains after dropping activeTransaction', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about');
      const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      (coordinator as unknown as {
        trackInFlight(href: string): void;
        clearInFlight(href: string): void;
      }).trackInFlight('/gallery');
      coordinator.activeTransaction = null;

      await coordinator.run(navOptions({ from: about, to: about, href: '/about' }));

      expect(runSpy).not.toHaveBeenCalled();
      expect(cancelSpy).not.toHaveBeenCalled();
      expect(coordinator.inFlightHref).toBe('/gallery');
    });
  });

  describe('planning — run', () => {
    it('runs when the committed route declares update hooks', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const about = createMatchedRoute('/about', { update: ['sync'] });
      const runSpy = jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });

      await coordinator.run(navOptions({ from: about, to: about, href: '/about' }));

      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it('runs when dynamic params change on the same route record', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const node = createUsersIdNode();
      const from = createUsersIdMatch('1', node);
      const to = createUsersIdMatch('2', node);
      const runSpy = jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });

      await coordinator.run(navOptions({ from, to, href: '/users/2' }));

      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it('runs navigation to a different href while another target is in flight', async () => {
      const engine = createCoordinatorMockEngine();
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
      expect(coordinator.inFlightHref).toBe('/gallery');

      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await aboutNav;
      await galleryNav;

      expect(engine.finalizeCancelled).toHaveBeenCalledTimes(1);
      expect(coordinator.inFlightHref).toBeNull();
      expect(coordinator.activeTransaction).toBeNull();
    });

    it('does not clear a newer activeTransaction when a superseded run settles', async () => {
      const coordinator = new NavigationCoordinator(createCoordinatorMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { resolveAt } = mockDeferredTransactionRun();

      const aboutNav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const galleryNav = coordinator.run(navOptions({ from: home, to: gallery, href: '/gallery' }));
      const secondTransaction = coordinator.activeTransaction;

      resolveAt(0, { status: 'cancelled' });
      await aboutNav;

      expect(coordinator.activeTransaction).toBe(secondTransaction);

      resolveAt(1, { status: 'navigationSucceeded' });
      await galleryNav;

      expect(coordinator.activeTransaction).toBeNull();
    });
  });

  describe('execution outcomes', () => {
    it('clears in-flight state and activeTransaction after navigationSucceeded', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');

      jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });

      await coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(coordinator.inFlightHref).toBeNull();
      expect(coordinator.activeTransaction).toBeNull();
      expect(engine.finalizeCancelled).not.toHaveBeenCalled();
      expect(engine.applyRedirect).not.toHaveBeenCalled();
      expect(engine.finalizeError).not.toHaveBeenCalled();
    });

    it('calls finalizeCancelled on cancelled result', async () => {
      const engine = createCoordinatorMockEngine();
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
      expect(coordinator.inFlightHref).toBeNull();
      expect(coordinator.activeTransaction).toBeNull();
    });

    it('calls applyRedirect on redirect result', async () => {
      const engine = createCoordinatorMockEngine();
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
      expect(coordinator.inFlightHref).toBeNull();
    });

    it('calls finalizeError on error result', async () => {
      const engine = createCoordinatorMockEngine();
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
      expect(coordinator.inFlightHref).toBeNull();
    });

    it('treats null pipeline result as success', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');

      jest.spyOn(NavigationTransaction.prototype, 'run').mockResolvedValue(null);

      await coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(engine.finalizeCancelled).not.toHaveBeenCalled();
      expect(engine.applyRedirect).not.toHaveBeenCalled();
      expect(engine.finalizeError).not.toHaveBeenCalled();
      expect(coordinator.inFlightHref).toBeNull();
    });
  });

  describe('in-flight lifecycle', () => {
    it('clears in-flight href only for the matching href', () => {
      const coordinator = new NavigationCoordinator(createCoordinatorMockEngine());
      const state = coordinator as unknown as {
        trackInFlight(href: string): void;
        clearInFlight(href: string): void;
      };

      state.trackInFlight('/about');
      state.clearInFlight('/gallery');

      expect(coordinator.inFlightHref).toBe('/about');

      state.clearInFlight('/about');
      expect(coordinator.inFlightHref).toBeNull();
    });

    it('keeps in-flight href until the run settles', async () => {
      const coordinator = new NavigationCoordinator(createCoordinatorMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      expect(coordinator.inFlightHref).toBe('/about');

      resolveAt(0, { status: 'navigationSucceeded' });
      await nav;

      expect(coordinator.inFlightHref).toBeNull();
    });
  });

  describe('isTransactionStale', () => {
    it('is false for the active transaction', async () => {
      const coordinator = new NavigationCoordinator(createCoordinatorMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const transaction = coordinator.activeTransaction!;

      expect(coordinator.isTransactionStale(transaction.transactionId, 0)).toBe(false);
      expect(transaction.isStale()).toBe(false);

      resolveAt(0, { status: 'navigationSucceeded' });
      await nav;
    });

    it('becomes true after a newer navigation supersedes', async () => {
      const coordinator = new NavigationCoordinator(createCoordinatorMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { resolveAt } = mockDeferredTransactionRun();

      const aboutNav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const firstTransaction = coordinator.activeTransaction!;
      const firstId = firstTransaction.transactionId;

      const galleryNav = coordinator.run(navOptions({ from: home, to: gallery, href: '/gallery' }));

      expect(coordinator.isTransactionStale(firstId, 0)).toBe(true);
      expect(firstTransaction.isStale()).toBe(true);

      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await aboutNav;
      await galleryNav;
    });

    it('becomes true after invalidate', async () => {
      const coordinator = new NavigationCoordinator(createCoordinatorMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const transaction = coordinator.activeTransaction!;

      coordinator.invalidate();

      expect(coordinator.isTransactionStale(transaction.transactionId, 0)).toBe(true);
      expect(transaction.isStale()).toBe(true);

      resolveAt(0, { status: 'cancelled' });
      await nav;
    });
  });

  describe('invalidate', () => {
    it('cancels the active transaction', async () => {
      const coordinator = new NavigationCoordinator(createCoordinatorMockEngine());
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      const transaction = coordinator.activeTransaction!;

      coordinator.invalidate();

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(transaction.isAborted).toBe(true);

      resolveAt(0, { status: 'cancelled' });
      await nav;
    });

    it('is safe when no transaction is active', () => {
      const coordinator = new NavigationCoordinator(createCoordinatorMockEngine());
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');

      coordinator.invalidate();

      expect(cancelSpy).not.toHaveBeenCalled();
      expect(coordinator.inFlightHref).toBeNull();
      expect(coordinator.activeTransaction).toBeNull();
      expect(coordinator.isTransactionStale(1, 0)).toBe(true);
    });

    it('clears inFlightHref so the same href can run again after stop', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();

      const first = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      expect(coordinator.inFlightHref).toBe('/about');

      coordinator.invalidate();

      expect(coordinator.inFlightHref).toBeNull();
      expect(coordinator.activeTransaction).toBeNull();

      const second = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));
      expect(runSpy).toHaveBeenCalledTimes(2);

      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await first;
      await second;
    });
    it('does not finalize cancelled navigation after engine stop', async () => {
      const engine = createCoordinatorMockEngine();
      const coordinator = new NavigationCoordinator(engine);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();

      const nav = coordinator.run(navOptions({ from: home, to: about, href: '/about' }));

      engine.isRunning = false;
      coordinator.invalidate();
      resolveAt(0, { status: 'cancelled' });
      await nav;

      expect(engine.finalizeCancelled).not.toHaveBeenCalled();
      expect(coordinator.inFlightHref).toBeNull();
      expect(coordinator.activeTransaction).toBeNull();
    });
  });
});

import { NavigationFailure } from '../../core/failure';
import { NavigationCoordinator } from '../../core/navigation/navigation-coordinator';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import type { NavigationTransactionOptions } from '../../core/navigation/types';
import * as redirectResolver from '../../core/redirect/redirect-resolver';
import {
  createUsersIdMatch,
  createUsersIdNode,
} from '../_helpers/create-dynamic-leaf-match';
import {
  createCoordinatorMockHost,
  createMatchedRoute,
} from '../_helpers/create-mock-transaction';
import {
  createPushNavOptions,
  mockDeferredTransactionRun,
} from '../_helpers/jest/navigation-fixtures';
import { DEFAULT_PUSH_NAV_OPTIONS } from '../_helpers/jest/constants';

function navOptions(
  input: Pick<NavigationTransactionOptions, 'from' | 'to' | 'href'>
): NavigationTransactionOptions {
  return createPushNavOptions(input);
}

/** Mirrors {@link NavigationCoordinator.navigate} entry/exit around {@link NavigationCoordinator.run}. */
async function engineNavigate(
  coordinator: NavigationCoordinator,
  options: NavigationTransactionOptions
): Promise<void> {
  const attempt = coordinator.beginNavigation(options.href);
  if (attempt === null) return;
  try {
    await coordinator.run(options);
  } finally {
    coordinator.settleNavigation(attempt);
  }
}

describe('NavigationCoordinator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('planning — noop', () => {
    it('skips when the committed URL is already active', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const about = createMatchedRoute('/about');
      const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');
      await coordinator.run(
        navOptions({ from: about, to: about, href: '/about' })
      );
      expect(runSpy).not.toHaveBeenCalled();
      expect(coordinator.activeTransaction).toBeNull();
      expect(coordinator.hasOpenNavigation('/about')).toBe(false);
      expect(host.engine.handleSameUrlNavigation).toHaveBeenCalledWith(about, '');
    });

    it('does not notify already-active on pop noop', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const about = createMatchedRoute('/about');
      await coordinator.run({
        ...navOptions({ from: about, to: about, href: '/about' }),
        action: 'pop',
      });
      expect(host.engine.handleSameUrlNavigation).not.toHaveBeenCalled();
    });

    it('ignores duplicate href while in flight', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();
      const first = engineNavigate(
        coordinator,
        navOptions({ from: home, to: about, href: '/about' })
      );
      const second = engineNavigate(
        coordinator,
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.hasOpenNavigation('/about')).toBe(true);
      resolveAt(0, { status: 'navigationSucceeded' });
      await first;
      await second;
      expect(coordinator.hasOpenNavigation('/about')).toBe(false);
    });

    it('runs the first navigation when from is null', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const about = createMatchedRoute('/about');
      const runSpy = jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });
      await coordinator.run(
        navOptions({ from: null, to: about, href: '/about' })
      );
      expect(runSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('planning — cancel-pending', () => {
    it('aborts in-flight navigation without starting a new transaction', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');
      const galleryAttempt = coordinator.beginNavigation('/gallery')!;
      const galleryNav = coordinator.run(
        navOptions({ from: about, to: gallery, href: '/gallery' })
      );
      await coordinator.run(
        navOptions({ from: about, to: about, href: '/about' })
      );
      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.activeTransaction).toBeNull();
      expect(host.restoreCommittedNavState).toHaveBeenCalledTimes(1);
      expect(host.restoreCommittedNavState).toHaveBeenCalledWith(
        expect.objectContaining({ href: '/gallery' })
      );
      expect(coordinator.hasOpenNavigation('/gallery')).toBe(true);
      resolveAt(0, { status: 'cancelled' });
      await galleryNav;
      coordinator.settleNavigation(galleryAttempt);
      expect(host.applyTerminalOutcome).toHaveBeenCalledTimes(1);
      expect(coordinator.hasOpenNavigation('/gallery')).toBe(false);
    });

    it('is a no-op when an open navigation remains after dropping activeTransaction', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const about = createMatchedRoute('/about');
      const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');
      coordinator.beginNavigation('/gallery');
      coordinator.activeTransaction = null;
      await coordinator.run(
        navOptions({ from: about, to: about, href: '/about' })
      );
      expect(runSpy).not.toHaveBeenCalled();
      expect(cancelSpy).not.toHaveBeenCalled();
      expect(host.restoreCommittedNavState).toHaveBeenCalledWith(null);
      expect(coordinator.hasOpenNavigation('/gallery')).toBe(true);
    });
  });

  describe('planning — run', () => {
    it('skips when the committed route declares update hooks', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const about = createMatchedRoute('/about', { update: ['sync'] });
      const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');
      await coordinator.run(
        navOptions({ from: about, to: about, href: '/about' })
      );
      expect(runSpy).not.toHaveBeenCalled();
    });

    it('runs when dynamic params change on the same route record', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
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
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');
      const aboutNav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      const galleryNav = coordinator.run(
        navOptions({ from: home, to: gallery, href: '/gallery' })
      );
      expect(runSpy).toHaveBeenCalledTimes(2);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await aboutNav;
      await galleryNav;
      // Superseded nav applies cancel; winner applies success (handoff consume).
      expect(host.applyTerminalOutcome).toHaveBeenCalledTimes(2);
      expect(host.applyTerminalOutcome).toHaveBeenNthCalledWith(
        1,
        { status: 'cancelled' },
        expect.objectContaining({ href: '/about' })
      );
      expect(host.applyTerminalOutcome).toHaveBeenNthCalledWith(
        2,
        { status: 'navigationSucceeded' },
        expect.objectContaining({ href: '/gallery' })
      );
      expect(coordinator.activeTransaction).toBeNull();
    });

    it('does not clear a newer activeTransaction when a superseded run settles', async () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { resolveAt } = mockDeferredTransactionRun();
      const aboutNav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      const galleryNav = coordinator.run(
        navOptions({ from: home, to: gallery, href: '/gallery' })
      );
      const secondTransaction = coordinator.activeTransaction;
      resolveAt(0, { status: 'cancelled' });
      await aboutNav;
      expect(coordinator.activeTransaction).toBe(secondTransaction);
      resolveAt(1, { status: 'navigationSucceeded' });
      await galleryNav;
      expect(coordinator.activeTransaction).toBeNull();
    });

    it('begins ResourceGraph prepare before cancelling A on supersede', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about', { load: ['data'] });
      const gallery = createMatchedRoute('/gallery', { load: ['data'] });
      const events: string[] = [];
      const resources = host.engine.resourceGraph;
      const originalHold = resources.pinSharedBufferFor.bind(resources);
      jest.spyOn(resources, 'pinSharedBufferFor').mockImplementation((to) => {
        events.push('pinSharedBufferFor');
        const hold = originalHold(to);
        const originalUnhold = hold.unpin.bind(hold);
        hold.unpin = () => {
          events.push('unpin');
          return originalUnhold();
        };
        return hold;
      });
      const originalCancel = NavigationTransaction.prototype.cancel;
      jest
        .spyOn(NavigationTransaction.prototype, 'cancel')
        .mockImplementation(function (
          this: NavigationTransaction,
          reason?: unknown
        ) {
          events.push('cancel');
          return originalCancel.call(this, reason);
        });
      const { resolveAt } = mockDeferredTransactionRun();
      const aboutNav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      events.length = 0;
      const galleryNav = coordinator.run(
        navOptions({ from: home, to: gallery, href: '/gallery' })
      );
      expect(events.indexOf('pinSharedBufferFor')).toBeGreaterThanOrEqual(0);
      expect(events.indexOf('cancel')).toBeGreaterThan(
        events.indexOf('pinSharedBufferFor')
      );
      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await aboutNav;
      await galleryNav;
      expect(events).toContain('unpin');
    });

    it('does not pinSharedBufferFor on the first navigation', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const pinSpy = jest.spyOn(
        host.engine.resourceGraph,
        'pinSharedBufferFor'
      );
      const { resolveAt } = mockDeferredTransactionRun();
      const nav = coordinator.run(
        navOptions({ from: null, to: createMatchedRoute('/a'), href: '/a' })
      );
      expect(pinSpy).not.toHaveBeenCalled();
      resolveAt(0, { status: 'navigationSucceeded' });
      await nav;
      expect(pinSpy).not.toHaveBeenCalled();
    });
  });

  describe('execution outcomes', () => {
    it('clears activeTransaction after navigationSucceeded', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });
      await coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(coordinator.activeTransaction).toBeNull();
      expect(host.applyTerminalOutcome).toHaveBeenCalledTimes(1);
      expect(host.applyTerminalOutcome).toHaveBeenCalledWith(
        { status: 'navigationSucceeded' },
        expect.objectContaining({ href: '/about' })
      );
    });

    it('calls applyTerminalOutcome on cancelled result', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'cancelled' });
      await coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(host.applyTerminalOutcome).toHaveBeenCalledTimes(1);
      expect(host.applyTerminalOutcome).toHaveBeenCalledWith(
        { status: 'cancelled' },
        expect.objectContaining({ href: '/about' })
      );
      expect(coordinator.activeTransaction).toBeNull();
    });

    it('calls applyTerminalOutcome on redirect result', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const redirect = {
        status: 'redirect' as const,
        url: '/login',
        replace: true,
      };
      jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue(redirect);
      await coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(host.applyTerminalOutcome).toHaveBeenCalledTimes(1);
      expect(host.applyTerminalOutcome).toHaveBeenCalledWith(
        redirect,
        expect.objectContaining({ href: '/about' })
      );
    });

    it('calls applyTerminalOutcome on error result', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const error = {
        status: 'error' as const,
        failure: NavigationFailure.notFound('/about', home, 'push'),
      };
      jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue(error);
      await coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(host.applyTerminalOutcome).toHaveBeenCalledTimes(1);
      expect(host.applyTerminalOutcome).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ href: '/about' })
      );
    });

    it('treats navigationSucceeded as success and applies terminal outcome', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      jest
        .spyOn(NavigationTransaction.prototype, 'run')
        .mockResolvedValue({ status: 'navigationSucceeded' });
      await coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(host.applyTerminalOutcome).toHaveBeenCalledTimes(1);
      expect(host.applyTerminalOutcome).toHaveBeenCalledWith(
        { status: 'navigationSucceeded' },
        expect.objectContaining({ href: '/about' })
      );
    });
  });

  describe('open navigation lifecycle', () => {
    it('clears open navigation only for the matching attempt', () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const aboutAttempt = coordinator.beginNavigation('/about')!;
      expect(coordinator.hasOpenNavigation('/about')).toBe(true);
      coordinator.settleNavigation({ ...aboutAttempt, href: '/gallery' });
      expect(coordinator.hasOpenNavigation('/about')).toBe(true);
      coordinator.settleNavigation(aboutAttempt);
      expect(coordinator.hasOpenNavigation('/about')).toBe(false);
      expect(coordinator.beginNavigation('/about')).not.toBeNull();
    });

    it('invalidates attempt when a newer navigation begins', () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const first = coordinator.beginNavigation('/about')!;
      expect(coordinator.isAttemptCurrent(first)).toBe(true);
      coordinator.beginNavigation('/gallery');
      expect(coordinator.isAttemptCurrent(first)).toBe(false);
      expect(first.signal.aborted).toBe(true);
    });

    it('cancel-pending when another href is still resolving', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const about = createMatchedRoute('/about');
      const runSpy = jest.spyOn(NavigationTransaction.prototype, 'run');
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');
      coordinator.beginNavigation('/gallery');
      await coordinator.run(
        navOptions({ from: about, to: about, href: '/about' })
      );
      expect(runSpy).not.toHaveBeenCalled();
      expect(cancelSpy).not.toHaveBeenCalled();
      expect(host.restoreCommittedNavState).toHaveBeenCalledWith(null);
      expect(coordinator.beginNavigation('/gallery')).toBeNull();
    });

    it('keeps open navigation until the attempt settles', async () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();
      const attempt = coordinator.beginNavigation('/about')!;
      const nav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(coordinator.hasOpenNavigation('/about')).toBe(true);
      resolveAt(0, { status: 'navigationSucceeded' });
      await nav;
      coordinator.settleNavigation(attempt);
      expect(coordinator.hasOpenNavigation('/about')).toBe(false);
    });
  });

  describe('isTransactionStale', () => {
    it('is false for the active transaction', async () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();
      const nav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      const transaction = coordinator.activeTransaction!;
      expect(coordinator.isTransactionStale(transaction.transactionId)).toBe(
        false
      );
      expect(transaction.isStale()).toBe(false);
      resolveAt(0, { status: 'navigationSucceeded' });
      await nav;
    });

    it('becomes true after a newer navigation supersedes', async () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const gallery = createMatchedRoute('/gallery');
      const { resolveAt } = mockDeferredTransactionRun();
      const aboutNav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      const firstTransaction = coordinator.activeTransaction!;
      const firstId = firstTransaction.transactionId;
      const galleryNav = coordinator.run(
        navOptions({ from: home, to: gallery, href: '/gallery' })
      );
      expect(coordinator.isTransactionStale(firstId)).toBe(true);
      expect(firstTransaction.isStale()).toBe(true);
      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await aboutNav;
      await galleryNav;
    });

    it('becomes true after invalidate', async () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();
      const nav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      const transaction = coordinator.activeTransaction!;
      coordinator.invalidate();
      expect(coordinator.isTransactionStale(transaction.transactionId)).toBe(
        true
      );
      expect(transaction.isStale()).toBe(true);
      resolveAt(0, { status: 'cancelled' });
      await nav;
    });
  });

  describe('invalidate', () => {
    it('cancels the active transaction', async () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');
      const nav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      const transaction = coordinator.activeTransaction!;
      coordinator.invalidate();
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(transaction.isAborted).toBe(true);
      resolveAt(0, { status: 'cancelled' });
      await nav;
    });

    it('is safe when no transaction is active', () => {
      const coordinator = new NavigationCoordinator(
        createCoordinatorMockHost()
      );
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');
      coordinator.invalidate();
      expect(cancelSpy).not.toHaveBeenCalled();
      expect(coordinator.activeTransaction).toBeNull();
      // Fresh coordinator starts at 0; invalidate fences so prior ids are stale.
      expect(coordinator.isTransactionStale(0)).toBe(true);
    });

    it('clears open navigations so the same href can run again after stop', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { runSpy, resolveAt } = mockDeferredTransactionRun();
      coordinator.beginNavigation('/about');
      const first = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(coordinator.hasOpenNavigation('/about')).toBe(true);
      coordinator.invalidate();
      expect(coordinator.hasOpenNavigation('/about')).toBe(false);
      expect(coordinator.activeTransaction).toBeNull();
      const second = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      expect(runSpy).toHaveBeenCalledTimes(2);
      resolveAt(0, { status: 'cancelled' });
      resolveAt(1, { status: 'navigationSucceeded' });
      await first;
      await second;
    });

    it('does not finalize cancelled navigation after engine stop', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const about = createMatchedRoute('/about');
      const { resolveAt } = mockDeferredTransactionRun();
      const nav = coordinator.run(
        navOptions({ from: home, to: about, href: '/about' })
      );
      (host as { isRunning: boolean }).isRunning = false;
      coordinator.invalidate();
      resolveAt(0, { status: 'cancelled' });
      await nav;
      expect(host.applyTerminalOutcome).not.toHaveBeenCalled();
      expect(coordinator.activeTransaction).toBeNull();
    });
  });

  describe('navigate — pre-pipeline terminals', () => {
    it('cancels an in-flight pipeline when resolve is unmatched', async () => {
      const host = createCoordinatorMockHost();
      const coordinator = new NavigationCoordinator(host);
      const home = createMatchedRoute('/');
      const contacts = createMatchedRoute('/contacts');
      const { resolveAt } = mockDeferredTransactionRun();
      const cancelSpy = jest.spyOn(NavigationTransaction.prototype, 'cancel');
      const contactsNav = coordinator.run(
        navOptions({ from: home, to: contacts, href: '/contacts' })
      );
      expect(coordinator.activeTransaction).not.toBeNull();
      jest
        .spyOn(redirectResolver, 'followRedirectsWithGuardWalk')
        .mockResolvedValue({
          status: 'unmatched',
          href: '/error',
        });
      await coordinator.navigate('/error', 'push', DEFAULT_PUSH_NAV_OPTIONS);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(host.handleUnmatchedNavigation).toHaveBeenCalledWith(
        '/error',
        'push',
        DEFAULT_PUSH_NAV_OPTIONS
      );
      expect(coordinator.activeTransaction).toBeNull();
      resolveAt(0, { status: 'cancelled' });
      await contactsNav;
    });
  });
});

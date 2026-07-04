import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../core';
import type { RouterInstance } from '../core';
import { NavigationTransaction } from '../core/navigation-transaction/navigation-transaction';

import { createDomRoute, collectRoutesFromDom } from './helpers/test-route-dom';

describe('AuraRoutingEngine + route tree', () => {
  const router: RouterInstance = { navigate: jest.fn() };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flat route match produces single-node chain', async () => {
    const transactions: NavigationTransaction[] = [];
    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      transactions.push(this);
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });

    engine.replaceRoutes(collectRoutesFromDom(createDomRoute('/'), createDomRoute('/about')));
    provider.start();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(transactions[0]!.to.chain?.map((entry) => entry.pattern)).toEqual(['/about']);
  });

  it('nested navigation passes branch chains to transaction', async () => {
    const transactions: NavigationTransaction[] = [];
    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      transactions.push(this);
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine(router, { provider });

    const profile = createDomRoute('profile');
    const security = createDomRoute('security');
    const settings = createDomRoute('/settings', [profile, security]);

    engine.replaceRoutes(collectRoutesFromDom(settings));
    provider.start();

    await engine.navigateTo('/settings/profile', 'push', { replace: false, syncHistory: true });
    await engine.navigateTo('/settings/security', 'push', { replace: false, syncHistory: true });

    expect(transactions[0]!.to.chain?.map((entry) => entry.pattern)).toEqual([
      '/settings',
      '/settings/profile',
    ]);

    expect(transactions[1]!.from!.chain?.map((entry) => entry.pattern)).toEqual([
      '/settings',
      '/settings/profile',
    ]);
    expect(transactions[1]!.to.chain?.map((entry) => entry.pattern)).toEqual([
      '/settings',
      '/settings/security',
    ]);
  });
});

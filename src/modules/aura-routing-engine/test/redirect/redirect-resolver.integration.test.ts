import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { registerTestHook } from '../helpers/jest/navigation-fixtures';
import {
  collectRoutesFromDom,
  createDomRedirectRoute,
  createDomRoute,
} from '../helpers/test-route-dom';

describe('RedirectResolver integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('collapses guard redirect into one coordinator run', async () => {
    const transactions: NavigationTransaction[] = [];
    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      transactions.push(this);
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    registerTestHook(engine.hooksRegistry, 'auth', () => '/login');

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    engine.replaceRoutes(collectRoutesFromDom(dashboard, login));
    provider.start();

    const applyRedirectSpy = jest.spyOn(engine, 'applyRedirect');

    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.to.pattern).toBe('/login');
    expect(applyRedirectSpy).not.toHaveBeenCalled();
  });

  it('runs leave only once after guard redirect chain resolves', async () => {
    let leaveCalls = 0;

    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      const { buildTransitionPlan, getEnterRoute } = await import('../../core/route-tree/transition-plan');
      const { NavigationTransactionPipeline } = await import('../../core/navigation/navigation-transaction-pipeline');
      this.transitionPlan = buildTransitionPlan(this.from, this.to);
      this.transitionOrder = getEnterRoute(this.transitionPlan)?.transition?.order ?? null;
      const guards = await new NavigationTransactionPipeline(this).runGuards();
      if (guards) return guards;
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    const home = createDomRoute('/');
    home.setAttribute('leave', 'home-leave');
    registerTestHook(engine.hooksRegistry, 'home-leave', () => {
      leaveCalls++;
    });
    registerTestHook(engine.hooksRegistry, 'auth', () => '/login');

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    engine.replaceRoutes(collectRoutesFromDom(home, dashboard, login));
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(leaveCalls).toBe(1);
  });

  it('collapses declarative redirect and guard redirect in one run', async () => {
    const transactions: NavigationTransaction[] = [];
    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      transactions.push(this);
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    registerTestHook(engine.hooksRegistry, 'auth', () => '/login');

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');
    const alias = createDomRedirectRoute('/app', '/dashboard');

    engine.replaceRoutes(collectRoutesFromDom(alias, dashboard, login));
    provider.start();

    await engine.navigateTo('/app', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.to.pattern).toBe('/login');
    expect(transactions[0]!.href).toBe('/login');
    expect(transactions[0]!.historyOptions.replace).toBe(true);
  });
});

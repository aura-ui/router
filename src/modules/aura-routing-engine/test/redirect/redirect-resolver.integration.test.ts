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

  it('runs leave on each blocking walk hop during guard redirect chain', async () => {
    let leaveCalls = 0;

    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      const { buildTransitionPlan, getEnterRoute } = await import('../../core/route-tree/transition-plan');
      this.transitionPlan = buildTransitionPlan(this.from, this.to);
      this.transitionOrder = getEnterRoute(this.transitionPlan)?.transition?.order ?? null;
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

    expect(leaveCalls).toBe(2);
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

  it('runs parent leave once on guard redirect to another branch', async () => {
    let settingsLeaveCalls = 0;
    let appLeaveCalls = 0;

    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const provider = new FakeHistoryProvider('/app/settings');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    registerTestHook(engine.hooksRegistry, 'app-leave', () => {
      appLeaveCalls++;
      return true;
    });
    registerTestHook(engine.hooksRegistry, 'settings-leave', () => {
      settingsLeaveCalls++;
      return true;
    });
    registerTestHook(engine.hooksRegistry, 'auth', () => '/login');

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('dashboard');
    const settings = createDomRoute('settings');
    settings.setAttribute('leave', 'settings-leave');
    const app = createDomRoute('/app', [settings, dashboard]);
    app.setAttribute('leave', 'app-leave');
    dashboard.setAttribute('guard', 'auth');

    engine.replaceRoutes(collectRoutesFromDom(app, login));
    provider.start();

    await engine.navigateTo('/app/settings', 'system', { replace: true, syncHistory: false });

    await engine.navigateTo('/app/dashboard', 'push', { replace: false, syncHistory: true });

    expect(settingsLeaveCalls).toBe(2);
    expect(appLeaveCalls).toBe(1);
  });
});

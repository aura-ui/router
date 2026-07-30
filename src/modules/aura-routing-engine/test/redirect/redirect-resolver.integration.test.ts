import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { collectNavigationErrors } from '../_helpers/collect-navigation-errors';
import { bootEngineWithDomRoutes } from '../_helpers/engine-harness';
import { registerTestHook } from '../_helpers/jest/navigation-fixtures';
import {
  createDomRedirectRoute,
  createDomRoute,
} from '../_helpers/test-route-dom';

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

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [dashboard, login],
      markRunning: true,
      boot: false,
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'auth', () => '/login');
      },
    });

    const applySpy = jest.spyOn(engine, 'applyTerminalOutcome');

    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.to.pattern).toBe('/login');
    // Collapse runs one leaf pipeline — success apply (handoff consume), not redirect apply.
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledWith(
      { status: 'navigationSucceeded' },
      expect.objectContaining({ href: '/login' }),
    );
  });

  it('runs leave on each blocking walk hop during guard redirect chain', async () => {
    let leaveCalls = 0;

    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      const { buildTransitionPlan } = await import('../../core/route-tree/transition-plan');
      this.transitionPlan = buildTransitionPlan(this.from, this.to);
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const home = createDomRoute('/');
    home.setAttribute('leave', 'home-leave');
    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [home, dashboard, login],
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'home-leave', () => {
          leaveCalls++;
        });
        registerTestHook(e.hooksRegistry, 'auth', () => '/login');
      },
    });

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

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');
    const alias = createDomRedirectRoute('/app', '/dashboard');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [alias, dashboard, login],
      boot: false,
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'auth', () => '/login');
      },
    });

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

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('dashboard');
    const settings = createDomRoute('settings');
    settings.setAttribute('leave', 'settings-leave');
    const app = createDomRoute('/app', [settings, dashboard]);
    app.setAttribute('leave', 'app-leave');
    dashboard.setAttribute('guard', 'auth');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/app/settings',
      domRoutes: [app, login],
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'app-leave', () => {
          appLeaveCalls++;
          return true;
        });
        registerTestHook(e.hooksRegistry, 'settings-leave', () => {
          settingsLeaveCalls++;
          return true;
        });
        registerTestHook(e.hooksRegistry, 'auth', () => '/login');
      },
    });

    await engine.navigateTo('/app/dashboard', 'push', { replace: false, syncHistory: true });

    expect(settingsLeaveCalls).toBe(2);
    expect(appLeaveCalls).toBe(1);
  });

  it('collapses leave redirect into one coordinator run', async () => {
    const transactions: NavigationTransaction[] = [];
    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      transactions.push(this);
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    let redirected = false;
    const home = createDomRoute('/');
    home.setAttribute('leave', 'gate');
    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [home, dashboard, login],
      setup: ({ engine: e }) => {
        e.hooksRegistry.register({
          name: 'gate',
          version: '1.0.0',
          fn: async () => {
            if (!redirected) {
              redirected = true;
              return '/login';
            }
            return true;
          },
        });
      },
    });

    transactions.length = 0;

    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.to.pattern).toBe('/login');
    expect(transactions[0]!.skipBlockingPhases).toBe(true);
  });

  it('collapses two-hop guard redirect chain into one coordinator run', async () => {
    const transactions: NavigationTransaction[] = [];
    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      transactions.push(this);
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const login = createDomRoute('/login');
    const settings = createDomRoute('/settings');
    settings.setAttribute('guard', 'to-login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'to-settings');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [dashboard, settings, login],
      boot: false,
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'to-settings', () => '/settings');
        registerTestHook(e.hooksRegistry, 'to-login', () => '/login');
      },
    });

    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.to.pattern).toBe('/login');
    expect(transactions[0]!.skipBlockingPhases).toBe(true);
  });

  it('cancels navigation during blocking walk without running pipeline', async () => {
    const transactions: NavigationTransaction[] = [];
    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      transactions.push(this);
      return { status: 'navigationSucceeded' };
    });

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    const { engine, provider } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [dashboard, login],
      boot: false,
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'auth', () => false);
      },
    });

    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(0);
    expect(provider.currentHref).toBe('/');
  });

  it('emits navigation:error on hook redirect cycle', async () => {
    const routeA = createDomRoute('/a');
    routeA.setAttribute('guard', 'to-b');
    const routeB = createDomRoute('/b');
    routeB.setAttribute('guard', 'to-a');

    const { engine, provider } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [routeA, routeB],
      boot: false,
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'to-b', () => '/b');
        registerTestHook(e.hooksRegistry, 'to-a', () => '/a');
      },
    });
    const errors = collectNavigationErrors(engine);

    await engine.navigateTo('/a', 'push', { replace: false, syncHistory: true });

    expect(errors).toEqual([
      expect.objectContaining({
        href: '/a',
        error: expect.objectContaining({ code: 'REDIRECT_CYCLE' }),
      }),
    ]);
    expect(provider.currentHref).toBe('/');
  });

  it('preserves search and hash through guard redirect walk', async () => {
    const transactions: NavigationTransaction[] = [];
    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      transactions.push(this);
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [dashboard, login],
      boot: false,
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'auth', () => '/login');
      },
    });

    await engine.navigateTo('/dashboard?tab=1#panel', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.href).toBe('/login?tab=1#panel');
    expect(transactions[0]!.to.search).toBe('?tab=1');
    expect(transactions[0]!.to.hash).toBe('#panel');
  });
});

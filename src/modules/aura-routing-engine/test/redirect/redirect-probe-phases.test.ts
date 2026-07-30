import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as transitionPlan from '../../core/route-tree/transition-plan';
import {
  createMatchedRoute,
  createMockEngine,
  createNavigationTransaction,
} from '../_helpers/create-mock-transaction';
import { bootEngineWithDomRoutes } from '../_helpers/engine-harness';
import { registerTestHook } from '../_helpers/jest/navigation-fixtures';
import {
  createDomRedirectRoute,
  createDomRoute,
} from '../_helpers/test-route-dom';

describe('redirect blocking walk policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs blocking walk probe only on hops with leave or guard', async () => {
    let guardPhaseCalls = 0;
    const original = NavigationTransaction.prototype.runRedirectCollapse;

    jest.spyOn(NavigationTransaction.prototype, 'runRedirectCollapse').mockImplementation(async function (
      this: NavigationTransaction,
    ) {
      guardPhaseCalls++;
      return original.call(this);
    });

    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const home = createDomRoute('/');
    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [home, dashboard, login],
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'auth', () => '/login');
      },
    });
    guardPhaseCalls = 0;

    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(guardPhaseCalls).toBe(1);
  });

  it('skips blocking walk for declarative-only redirect chains', async () => {
    let guardPhaseCalls = 0;

    jest.spyOn(NavigationTransaction.prototype, 'runRedirectCollapse').mockImplementation(async function () {
      guardPhaseCalls++;
      return null;
    });

    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const target = createDomRoute('/target');
    const hopB = createDomRedirectRoute('/b', '/target');
    const hopA = createDomRedirectRoute('/a', '/b');
    const home = createDomRoute('/');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [home, hopA, hopB, target],
    });
    guardPhaseCalls = 0;

    await engine.navigateTo('/a', 'push', { replace: false, syncHistory: true });

    expect(guardPhaseCalls).toBe(0);
  });

  it('runRedirectCollapse reuses a preset transition plan', async () => {
    const planSpy = jest.spyOn(transitionPlan, 'buildTransitionPlan');
    const engine = createMockEngine();
    const from = createMatchedRoute('/home');
    const to = createMatchedRoute('/about', { guard: ['auth'] });
    const presetPlan = transitionPlan.buildTransitionPlan(from, to);

    const transaction = createNavigationTransaction({
      engine,
      id: 0,
      from,
      to,
      plan: presetPlan,
    });

    planSpy.mockClear();
    jest.spyOn(NavigationTransactionPipeline.prototype, 'runGuards').mockResolvedValue(null);

    await transaction.runRedirectCollapse();

    expect(planSpy).not.toHaveBeenCalled();
  });

  it('runs leave and guard in walk and skips runGuards in full pipeline', async () => {
    const runGuardsSpy = jest.spyOn(NavigationTransactionPipeline.prototype, 'runGuards');

    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const home = createDomRoute('/');
    home.setAttribute('leave', 'home-leave');
    const about = createDomRoute('/about');
    about.setAttribute('guard', 'about-guard');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [home, about],
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'home-leave', () => true);
        registerTestHook(e.hooksRegistry, 'about-guard', () => true);
      },
    });
    runGuardsSpy.mockClear();

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(runGuardsSpy).toHaveBeenCalledTimes(1);
  });

  it('runs blocking walk when only exit routes declare leave', async () => {
    let guardPhaseCalls = 0;
    const original = NavigationTransaction.prototype.runRedirectCollapse;

    jest.spyOn(NavigationTransaction.prototype, 'runRedirectCollapse').mockImplementation(async function (
      this: NavigationTransaction,
    ) {
      guardPhaseCalls++;
      return original.call(this);
    });

    jest.spyOn(NavigationTransaction.prototype, 'run').mockImplementation(async function (this: NavigationTransaction) {
      this.engine.commitNavigation(this);
      return { status: 'navigationSucceeded' };
    });

    const home = createDomRoute('/');
    home.setAttribute('leave', 'home-leave');
    const about = createDomRoute('/about');

    const { engine } = await bootEngineWithDomRoutes({
      href: '/',
      domRoutes: [home, about],
      setup: ({ engine: e }) => {
        registerTestHook(e.hooksRegistry, 'home-leave', () => true);
      },
    });
    guardPhaseCalls = 0;

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(guardPhaseCalls).toBe(1);
  });

  it('sets skipBlockingPhases when prior hop ran blocking walk but final leaf has no hooks', async () => {
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

    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.to.pattern).toBe('/login');
    expect(transactions[0]!.skipBlockingPhases).toBe(true);
  });
});

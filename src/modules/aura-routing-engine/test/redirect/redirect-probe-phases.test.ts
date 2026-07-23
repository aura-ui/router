import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import * as transitionPlan from '../../core/route-tree/transition-plan';
import { createMatchedRoute, createMockEngine } from '../_helpers/create-mock-transaction';
import { DEFAULT_PUSH_NAV_OPTIONS } from '../_helpers/jest/constants';
import { registerTestHook } from '../_helpers/jest/navigation-fixtures';
import {
  collectRoutesFromDom,
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

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    registerTestHook(engine.hooksRegistry, 'auth', () => '/login');

    const home = createDomRoute('/');
    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    engine.replaceRoutes(collectRoutesFromDom(home, dashboard, login));
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
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

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    const target = createDomRoute('/target');
    const hopB = createDomRedirectRoute('/b', '/target');
    const hopA = createDomRedirectRoute('/a', '/b');
    const home = createDomRoute('/');

    engine.replaceRoutes(collectRoutesFromDom(home, hopA, hopB, target));
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
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

    const transaction = new NavigationTransaction(
      0,
      {
        from,
        to,
        action: 'push',
        href: to.href,
        hash: '',
        options: DEFAULT_PUSH_NAV_OPTIONS,
      },
      () => false,
      engine,
    );
    transaction.transitionPlan = presetPlan;

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

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    const home = createDomRoute('/');
    home.setAttribute('leave', 'home-leave');
    registerTestHook(engine.hooksRegistry, 'home-leave', () => true);

    const about = createDomRoute('/about');
    about.setAttribute('guard', 'about-guard');
    registerTestHook(engine.hooksRegistry, 'about-guard', () => true);

    engine.replaceRoutes(collectRoutesFromDom(home, about));
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
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

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    const home = createDomRoute('/');
    home.setAttribute('leave', 'home-leave');
    registerTestHook(engine.hooksRegistry, 'home-leave', () => true);

    const about = createDomRoute('/about');

    engine.replaceRoutes(collectRoutesFromDom(home, about));
    provider.start();

    await engine.navigateTo('/', 'system', { replace: true, syncHistory: false });
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

    const provider = new FakeHistoryProvider('/');
    const engine = new AuraRoutingEngine({ navigate: jest.fn() }, { provider });

    registerTestHook(engine.hooksRegistry, 'auth', () => '/login');

    const login = createDomRoute('/login');
    const dashboard = createDomRoute('/dashboard');
    dashboard.setAttribute('guard', 'auth');

    engine.replaceRoutes(collectRoutesFromDom(dashboard, login));
    provider.start();

    await engine.navigateTo('/dashboard', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.to.pattern).toBe('/login');
    expect(transactions[0]!.skipBlockingPhases).toBe(true);
  });
});

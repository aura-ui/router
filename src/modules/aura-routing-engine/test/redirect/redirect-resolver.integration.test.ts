import {
  AuraRoutingEngine,
  FakeHistoryProvider,
} from '../../core';
import { NavigationTransaction } from '../../core/navigation/navigation-transaction';
import { NavigationTransactionPipeline } from '../../core/navigation/navigation-transaction-pipeline';
import { DEFAULT_PUSH_NAV_OPTIONS } from '../helpers/jest/constants';
import { registerTestHook } from '../helpers/jest/navigation-fixtures';
import { createMatchedRoute, createMockEngine } from '../helpers/create-mock-transaction';
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
    expect(transactions[0]!.completedBlockingPhases).toEqual({});
    expect(applyRedirectSpy).not.toHaveBeenCalled();
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

  it('skips duplicate blocking phases when completedBlockingPhases is set', async () => {
    const to = createMatchedRoute('/login');
    const transaction = new NavigationTransaction(
      1,
      0,
      {
        from: null,
        to,
        href: '/login',
        hash: '',
        action: 'push',
        options: DEFAULT_PUSH_NAV_OPTIONS,
        completedBlockingPhases: {},
      },
      () => false,
      createMockEngine(),
    );
    transaction.transitionPlan = {
      exitRoutes: [],
      enterRoutes: [to],
      lca: null,
      update: false,
    };
    transaction.transitionOrder = null;

    const pipeline = new NavigationTransactionPipeline(transaction);
    const guardsSpy = jest.spyOn(pipeline, 'runGuards');
    const loadsSpy = jest.spyOn(pipeline, 'runLoads');
    const historySpy = jest.spyOn(pipeline, 'runCommitHistory').mockResolvedValue(null);
    jest.spyOn(pipeline, 'runRenderWithTransition').mockResolvedValue(null);
    jest.spyOn(pipeline, 'runAfterRender').mockResolvedValue(null);

    await pipeline.runFullPipeline();

    expect(guardsSpy).not.toHaveBeenCalled();
    expect(loadsSpy).not.toHaveBeenCalled();
    expect(historySpy).toHaveBeenCalled();
  });

  it('skips duplicate loads in runUpdate when completedBlockingPhases is set', async () => {
    const to = createMatchedRoute('/users/2');
    const transaction = new NavigationTransaction(
      1,
      0,
      {
        from: createMatchedRoute('/users/1'),
        to,
        href: '/users/2',
        hash: '',
        action: 'push',
        options: DEFAULT_PUSH_NAV_OPTIONS,
        completedBlockingPhases: {},
      },
      () => false,
      createMockEngine(),
    );
    transaction.transitionPlan = {
      exitRoutes: [],
      enterRoutes: [to],
      lca: to,
      update: true,
    };
    transaction.transitionOrder = null;

    const pipeline = new NavigationTransactionPipeline(transaction);
    const loadsSpy = jest.spyOn(pipeline, 'runLoads');
    jest.spyOn(pipeline, 'runCommitHistory').mockResolvedValue(null);
    jest.spyOn(pipeline, 'runLifecyclePhase').mockResolvedValue(null);

    await pipeline.runUpdate();

    expect(loadsSpy).not.toHaveBeenCalled();
  });
});

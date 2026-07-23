import { createEngineHarness } from './_helpers/engine-harness';
import { mockCapturingTransactionRunSuccess } from './_helpers/jest/navigation-fixtures';
import {
  createDomRedirectRoute,
  createDomRoute,
} from './_helpers/test-route-dom';

describe('AuraRoutingEngine + route tree', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flat route match produces single-node chain', async () => {
    const transactions = mockCapturingTransactionRunSuccess();
    const { engine } = createEngineHarness({
      domRoutes: [createDomRoute('/'), createDomRoute('/about')],
    });

    await engine.navigateTo('/about', 'push', { replace: false, syncHistory: true });

    expect(transactions[0]!.to.chain?.map((entry) => entry.pattern)).toEqual(['/about']);
  });

  it('nested navigation passes branch chains to transaction', async () => {
    const transactions = mockCapturingTransactionRunSuccess();
    const profile = createDomRoute('profile');
    const security = createDomRoute('security');
    const settings = createDomRoute('/settings', [profile, security]);
    const { engine } = createEngineHarness({
      domRoutes: [settings],
    });

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

  it('navigateTo follows declarative redirect before running pipeline', async () => {
    const transactions = mockCapturingTransactionRunSuccess();
    const profile = createDomRoute('/settings/profile');
    const alias = createDomRedirectRoute('/settings', '/settings/profile');
    const { engine } = createEngineHarness({
      domRoutes: [alias, profile],
    });

    await engine.navigateTo('/settings', 'push', { replace: false, syncHistory: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.href).toBe('/settings/profile');
    expect(transactions[0]!.to.pattern).toBe('/settings/profile');
    expect(transactions[0]!.historyOptions.replace).toBe(true);
  });
});

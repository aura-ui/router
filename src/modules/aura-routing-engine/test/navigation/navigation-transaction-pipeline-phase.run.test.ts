import { HookRegistry } from '../../core/hooks/registry';
import { PHASES } from '../../core/lifecycle';
import { NavigationTransactionPipelinePhase } from '../../core/navigation/navigation-transaction-pipeline-phase';
import {
  createMatchedRoute,
  createMockTransaction,
} from '../helpers/create-mock-transaction';

function registerHook(
  registry: HookRegistry,
  name: string,
  fn: () => unknown | Promise<unknown>,
): void {
  registry.register({
    name,
    version: '1.0.0',
    fn: async () => fn() as never,
  });
}

describe('NavigationTransactionPipelinePhase.resolveBlockingHookOutcome', () => {
  it('returns cancelled when hook returns false', () => {
    expect(NavigationTransactionPipelinePhase.resolveBlockingHookOutcome(false)).toEqual({
      status: 'cancelled',
    });
  });

  it('returns redirect when hook returns a URL string', () => {
    expect(NavigationTransactionPipelinePhase.resolveBlockingHookOutcome('/login')).toEqual({
      status: 'redirect',
      url: '/login',
    });
  });

  it('returns redirect with replace when hook returns redirect object', () => {
    expect(
      NavigationTransactionPipelinePhase.resolveBlockingHookOutcome({ url: '/login', replace: true }),
    ).toEqual({ status: 'redirect', url: '/login', replace: true });
  });

  it('returns null when hook allows navigation to continue', () => {
    expect(NavigationTransactionPipelinePhase.resolveBlockingHookOutcome(undefined)).toBeNull();
  });
});

describe('NavigationTransactionPipelinePhase.run (post-commit)', () => {
  it('logs post-commit hook errors when policy is log', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const matchedRoute = createMatchedRoute('/to', { ready: ['cleanup'] });
    const transaction = createMockTransaction({ enterRoutes: [matchedRoute] });
    registerHook(transaction.engine.hooksRegistry, 'cleanup', () => {
      throw new Error('cleanup failed');
    });

    const result = await NavigationTransactionPipelinePhase.run(
      matchedRoute,
      PHASES.ready,
      transaction,
    );

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      '[ready] post-commit hook threw (logged, continuing):',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('warns when a post-commit hook returns cancel or redirect', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const cancelRoute = createMatchedRoute('/to', { ready: ['cancel-after'] });
    const cancelTx = createMockTransaction({ enterRoutes: [cancelRoute] });
    registerHook(cancelTx.engine.hooksRegistry, 'cancel-after', () => false);
    await NavigationTransactionPipelinePhase.run(cancelRoute, PHASES.ready, cancelTx);

    const redirectRoute = createMatchedRoute('/to', { ready: ['redirect-after'] });
    const redirectTx = createMockTransaction({ enterRoutes: [redirectRoute] });
    registerHook(redirectTx.engine.hooksRegistry, 'redirect-after', () => '/login');
    await NavigationTransactionPipelinePhase.run(redirectRoute, PHASES.ready, redirectTx);

    expect(warnSpy).toHaveBeenCalledWith('[ready] post-commit hook returned false — ignored');
    expect(warnSpy).toHaveBeenCalledWith(
      '[ready] post-commit hook returned redirect — ignored: /login',
    );
    warnSpy.mockRestore();
  });
});

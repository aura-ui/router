import { HookRegistry } from '../../core/hooks/registry';
import { HookPolicyExecutor, type LifecycleLogger } from '../../core/lifecycle';
import type { RouteLifecycleContext } from '../../core/route/types';
import { createTestRoute } from '../helpers/create-test-route';

function createLogger(): jest.Mocked<LifecycleLogger> {
  return {
    postCommitHookFailed: jest.fn(),
    postCommitCancelIgnored: jest.fn(),
    postCommitRedirectIgnored: jest.fn(),
  };
}

function createLifecycleContext(): RouteLifecycleContext {
  const route = createTestRoute('/to');
  return {
    phase: 'after',
    from: null,
    to: { pathname: '/to' },
    router: { navigate: jest.fn() },
    route,
    action: 'push',
    jobId: 1,
    signal: new AbortController().signal,
  };
}

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

describe('HookPolicyExecutor', () => {
  it('logs post-commit hook errors when policy is log', async () => {
    const registry = new HookRegistry();
    const logger = createLogger();
    registerHook(registry, 'cleanup', () => {
      throw new Error('cleanup failed');
    });

    const outcome = await new HookPolicyExecutor(logger).runPostCommit(
      createLifecycleContext(),
      { hookRegistry: registry, isJobActive: () => true },
      ['cleanup'],
      'log',
      'after',
    );

    expect(outcome).toBeNull();
    expect(logger.postCommitHookFailed).toHaveBeenCalledWith('after', expect.any(Error));
  });

  it('warns when a post-commit hook returns cancel or redirect', async () => {
    const registry = new HookRegistry();
    const logger = createLogger();
    registerHook(registry, 'cancel-after', () => false);
    registerHook(registry, 'redirect-after', () => '/login');
    const executor = new HookPolicyExecutor(logger);
    const lifecycleContext = createLifecycleContext();
    const runnerContext = { hookRegistry: registry, isJobActive: () => true };

    await executor.runPostCommit(lifecycleContext, runnerContext, ['cancel-after'], 'log', 'after');
    await executor.runPostCommit(lifecycleContext, runnerContext, ['redirect-after'], 'log', 'after');

    expect(logger.postCommitCancelIgnored).toHaveBeenCalledWith('after');
    expect(logger.postCommitRedirectIgnored).toHaveBeenCalledWith('after', '/login');
  });
});

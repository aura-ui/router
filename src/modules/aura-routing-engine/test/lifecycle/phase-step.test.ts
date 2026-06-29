import { FailedNavigation, NavigationError } from '../../core/failure';
import {
  guardResultToPhaseOutcome,
  phaseStepToPipelineOutcome,
  runPhaseStep,
  type PhaseStepHandlers,
} from '../../core/lifecycle';
import type { MatchedRouteInfo } from '../../core/match/url-matcher';
import { createTestRoute } from '../helpers/create-test-route';

function navigationErrorResult(message: string) {
  return FailedNavigation.fromPipeline(
    new NavigationError({
      code: 'GUARD_THROW',
      phase: 'enter',
      routePattern: '/x',
      message,
    }),
    { view: 'none', href: '/x' },
    null,
    {
      href: '/x',
      pathname: '/x',
      search: '',
      hash: '',
      pattern: '/x',
      route: createTestRoute('/x'),
    } satisfies MatchedRouteInfo,
    'push',
  ).toResult();
}

describe('guardResultToPhaseOutcome', () => {
  it('maps guard results to terminal outcomes', () => {
    expect(guardResultToPhaseOutcome(false)).toEqual({ status: 'cancelled' });
    expect(guardResultToPhaseOutcome('/login')).toEqual({ status: 'redirect', url: '/login' });
    expect(guardResultToPhaseOutcome({ url: '/x', replace: true })).toEqual({
      status: 'redirect',
      url: '/x',
      replace: true,
    });
    expect(guardResultToPhaseOutcome(undefined)).toBeNull();
  });
});

describe('runPhaseStep', () => {
  const handlers: PhaseStepHandlers = {
    runBlockingHooks: jest.fn(),
    runPostCommitHooks: jest.fn(),
    failWithError: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns failure when route callback throws and onThrow is failure', async () => {
    (handlers.failWithError as jest.Mock).mockResolvedValue(navigationErrorResult('enter failed'));

    const outcome = await runPhaseStep({
      lifecyclePhase: 'enter',
      onThrow: 'failure',
      hookPolicy: { kind: 'blocking' },
      invokeRoute: () => {
        throw new Error('enter failed');
      },
      hookNames: null,
      handlers,
    });

    expect(handlers.failWithError).toHaveBeenCalled();
    expect(outcome).toMatchObject({
      status: 'error',
      failure: expect.objectContaining({
        error: expect.objectContaining({ message: 'enter failed' }),
      }),
    });
  });

  it('logs and continues when onThrow is log', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const outcome = await runPhaseStep({
      lifecyclePhase: 'left',
      onThrow: 'log',
      hookPolicy: { kind: 'postCommit', onError: 'log' },
      invokeRoute: () => {
        throw new Error('cleanup failed');
      },
      hookNames: ['cleanup'],
      handlers,
    });

    expect(outcome).toBeNull();
    expect(handlers.runPostCommitHooks).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('delegates to blocking hooks when route callback succeeds', async () => {
    (handlers.runBlockingHooks as jest.Mock).mockResolvedValue({ status: 'cancelled' });

    const outcome = await runPhaseStep({
      lifecyclePhase: 'enter',
      onThrow: 'failure',
      hookPolicy: { kind: 'blocking' },
      invokeRoute: () => {},
      hookNames: ['auth'],
      handlers,
    });

    expect(handlers.runBlockingHooks).toHaveBeenCalledWith(['auth']);
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('returns failure when blocking hooks throw and onThrow is failure', async () => {
    (handlers.failWithError as jest.Mock).mockResolvedValue(navigationErrorResult('auth failed'));
    (handlers.runBlockingHooks as jest.Mock).mockRejectedValue(new Error('auth failed'));

    const outcome = await runPhaseStep({
      lifecyclePhase: 'enter',
      onThrow: 'failure',
      hookPolicy: { kind: 'blocking' },
      invokeRoute: () => {},
      hookNames: ['auth'],
      handlers,
    });

    expect(handlers.failWithError).toHaveBeenCalledWith(expect.any(Error));
    expect(outcome).toMatchObject({
      status: 'error',
      failure: expect.objectContaining({
        error: expect.objectContaining({ message: 'auth failed' }),
      }),
    });
  });

  it('phaseStepToPipelineOutcome rejects unstructured error results', () => {
    expect(() =>
      phaseStepToPipelineOutcome({ status: 'error', error: new Error('leaked') } as never),
    ).toThrow(/NavigationErrorResult/);
  });
});

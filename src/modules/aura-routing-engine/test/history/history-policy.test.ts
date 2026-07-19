import { NavigationFailure, NavigationError } from '../../core/failure';
import {
  applyHistoryPolicy,
  applyTransactionHistory,
  resolveHistoryPolicy,
} from '../../core/history/history-policy';
import type { HistoryAction } from '../../core/history/provider.types';
import type { TransactionResult } from '../../core/navigation/types';
import type { ViewCommitState } from '../../core/view-mount/view-commit-state';
import { createTestRoute } from '../helpers/create-test-route';

function pipelineErrorResult(
  code: NavigationError['code'],
  phase: NavigationError['phase'],
  view: ViewCommitState,
  href: string,
  action: HistoryAction = 'push',
): Extract<TransactionResult, { status: 'error' }> {
  const to = {
    href,
    pathname: href,
    search: '',
    hash: '',
    pattern: href,
    route: createTestRoute(href),
  };

  return NavigationFailure.fromPipeline(
    new NavigationError({ code, phase, routePattern: href, message: 'fail' }),
    { view, href },
    null,
    to,
    action,
  ).toResult();
}

describe('resolveHistoryPolicy', () => {
  it.each([
    ['navigationSucceeded', { status: 'navigationSucceeded' } satisfies TransactionResult, 'push', 'commit-target'],
    [
      'navigationSucceeded same target (update)',
      { status: 'navigationSucceeded' } satisfies TransactionResult,
      'push',
      'preserve',
      { sameTarget: true },
    ],
    ['cancelled push', { status: 'cancelled' } satisfies TransactionResult, 'push', 'preserve'],
    ['cancelled pop', { status: 'cancelled' } satisfies TransactionResult, 'pop', 'rollback-source'],
    ['error pre-render push', pipelineErrorResult('GUARD_THROW', 'guard', 'none', '/d'), 'push', 'preserve'],
    ['error render push', pipelineErrorResult('RENDER_FAILED', 'render', 'committed', '/d'), 'push', 'commit-target'],
    ['error staged transition push', pipelineErrorResult('TRANSITION_FAILED', 'transitionOut', 'staged', '/d'), 'push', 'preserve'],
    ['error pre-render pop', pipelineErrorResult('LOAD_FAILED', 'load', 'none', '/d'), 'pop', 'rollback-source'],
    [
      'error NOT_FOUND push',
      { status: 'error', failure: NavigationFailure.notFound('/missing', null, 'push') },
      'push',
      'commit-target',
    ],
    [
      'error NOT_FOUND system',
      { status: 'error', failure: NavigationFailure.notFound('/missing', null, 'system') },
      'system',
      'preserve',
    ],
    [
      'error REDIRECT_CYCLE push',
      { status: 'error', failure: NavigationFailure.redirectError('redirect-cycle', '/a', null, 'push') },
      'push',
      'preserve',
    ],
    [
      'redirect',
      { status: 'redirect', url: '/login' } satisfies TransactionResult,
      'push',
      'preserve',
    ],
  ] as const)('%s', (_label, result, action, expected, options = {}) => {
    expect(resolveHistoryPolicy(result, action, { syncHistory: true, ...options })).toBe(expected);
  });
});

describe('applyHistoryPolicy', () => {
  const provider = {
    commit: jest.fn(),
    rollback: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('commits on commit-target', () => {
    applyHistoryPolicy(
      'commit-target',
      { href: '/d', fromHref: '/a', options: { replace: false, syncHistory: true } },
      provider,
    );
    expect(provider.commit).toHaveBeenCalledWith('/d', { replace: false, syncHistory: true });
    expect(provider.rollback).not.toHaveBeenCalled();
  });

  it('rollbacks on rollback-source when fromHref present', () => {
    applyHistoryPolicy(
      'rollback-source',
      { href: '/d', fromHref: '/a', options: { replace: false, syncHistory: true } },
      provider,
    );
    expect(provider.rollback).toHaveBeenCalledWith('/a');
    expect(provider.commit).not.toHaveBeenCalled();
  });

  it('preserves history on preserve', () => {
    applyHistoryPolicy(
      'preserve',
      { href: '/d', fromHref: '/a', options: { replace: false, syncHistory: true } },
      provider,
    );
    expect(provider.commit).not.toHaveBeenCalled();
    expect(provider.rollback).not.toHaveBeenCalled();
  });
});

describe('applyTransactionHistory', () => {
  it('commits on navigationSucceeded', () => {
    const provider = { commit: jest.fn(), rollback: jest.fn() };
    applyTransactionHistory(
      { status: 'navigationSucceeded' },
      'push',
      '/to',
      '/from',
      { replace: false, syncHistory: true },
      provider,
    );
    expect(provider.commit).toHaveBeenCalledWith('/to', { replace: false, syncHistory: true });
  });
});

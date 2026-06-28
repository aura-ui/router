import type { TransactionResult } from '../../core/navigation/transaction-result';
import { FailedNavigation } from '../../core/failure/navigation-failure';
import {
  applyTransactionHistory,
  finalizeNotFoundNavigation,
  finalizeProcessorNavigation,
} from '../../core/navigation/finalize';

describe('navigation/finalize', () => {
  const provider = { commit: jest.fn(), rollback: jest.fn() };
  const failureDeps = {
    onNotFound: jest.fn(),
    onNavigationError: jest.fn(),
    notFoundHandler: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applyTransactionHistory commits on navigationSucceeded', () => {
    const result: TransactionResult = { status: 'navigationSucceeded' };
    applyTransactionHistory(result, 'push', '/to', '/from', { replace: false, syncHistory: true }, provider);
    expect(provider.commit).toHaveBeenCalledWith('/to', { replace: false, syncHistory: true });
  });

  it('finalizeProcessorNavigation is a no-op on navigationSucceeded (commit gate already ran)', () => {
    const to = {
      href: '/to',
      pathname: '/to',
      search: '',
      hash: '',
      pattern: '/to',
      route: {} as never,
    };
    const onNavigationCommitted = jest.fn();

    const effects = finalizeProcessorNavigation(
      { status: 'navigationSucceeded' },
      {
        action: 'push',
        href: '/to',
        options: { replace: false, syncHistory: true },
        from: null,
        to,
        hash: '',
      },
      provider,
      { failureDeps, onNavigationCommitted, onRedirect: jest.fn() },
    );

    expect(effects).toEqual({});
    expect(onNavigationCommitted).not.toHaveBeenCalled();
    expect(provider.commit).not.toHaveBeenCalled();
  });

  it('finalizeProcessorNavigation redirects without history side effects', () => {
    const onRedirect = jest.fn();

    const effects = finalizeProcessorNavigation(
      { status: 'redirect', url: '/login' },
      {
        action: 'push',
        href: '/to',
        options: { replace: false, syncHistory: true },
        from: null,
        to: { href: '/to', pathname: '/to', search: '', hash: '', pattern: '/to', route: {} as never },
        hash: '',
      },
      provider,
      { failureDeps, onRedirect },
    );

    expect(effects).toEqual({});
    expect(onRedirect).toHaveBeenCalledWith('/login', false);
    expect(provider.commit).not.toHaveBeenCalled();
  });

  it('finalizeNotFoundNavigation runs callbacks and commits on push', () => {
    const failure = FailedNavigation.notFound('/missing', null, 'push');

    const effects = finalizeNotFoundNavigation(
      failure,
      'push',
      '/missing',
      null,
      { replace: false, syncHistory: true },
      provider,
      failureDeps,
    );

    expect(failureDeps.onNotFound).toHaveBeenCalledWith(failure);
    expect(failureDeps.notFoundHandler).toHaveBeenCalledWith('/missing');
    expect(provider.commit).toHaveBeenCalled();
    expect(effects).toEqual({ setPrev: null });
  });
});

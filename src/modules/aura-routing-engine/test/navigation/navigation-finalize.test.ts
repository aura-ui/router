import { FailedNavigation } from '../../core/failure';
import {
  applyTransactionHistory,
  finalizeNotFoundNavigation,
} from '../../core/navigation/navigation-finalize';
import type { TransactionResult } from '../../core/navigation/types';

describe('navigation/navigation-finalize', () => {
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

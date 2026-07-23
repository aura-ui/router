import { NavigationFailure, NavigationError } from '../../core/failure';
import { applyNavigationOutcome } from '../../core/navigation/navigation-outcome';
import { createTestRoute } from '../_helpers/create-test-route';

describe('applyNavigationOutcome (pre-match / error)', () => {
  const provider = { commit: jest.fn(), rollback: jest.fn() };
  const onNotFound = jest.fn();
  const setPrev = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function ctx() {
    return {
      provider,
      onNotFound,
      setPrev,
      navigateTo: jest.fn(),
    };
  }

  function identity(href: string) {
    return {
      action: 'push' as const,
      href,
      fromHref: null,
      historyOptions: { replace: false, syncHistory: true },
    };
  }

  it('notifies onNotFound, commits history, clears prev', () => {
    const failure = NavigationFailure.notFound('/missing', null, 'push');

    applyNavigationOutcome(failure.toResult(), identity('/missing'), ctx());

    expect(onNotFound).toHaveBeenCalledWith(failure);
    expect(provider.commit).toHaveBeenCalled();
    expect(setPrev).toHaveBeenCalledWith(null);
  });

  it('skips onNotFound for redirect errors', () => {
    const failure = NavigationFailure.redirectError('redirect-cycle', '/a', null, 'push');

    applyNavigationOutcome(failure.toResult(), identity('/a'), ctx());

    expect(onNotFound).not.toHaveBeenCalled();
    expect(provider.commit).not.toHaveBeenCalled();
    expect(setPrev).not.toHaveBeenCalled();
  });

  it('sets prev for committed pipeline error', () => {
    const to = {
      href: '/x',
      pathname: '/x',
      search: '',
      hash: '',
      pattern: '/x',
      route: createTestRoute('/x'),
    };
    const failure = NavigationFailure.fromPipeline(
      new NavigationError({
        code: 'RENDER_FAILED',
        phase: 'render',
        routePattern: '/x',
        message: 'fail',
      }),
      { view: 'committed', href: '/x' },
      null,
      to,
      'push',
    );

    applyNavigationOutcome(failure.toResult(), identity('/x'), ctx());

    expect(setPrev).toHaveBeenCalledWith(to);
  });

  it('skips history when already committed (non-pop)', () => {
    const failure = NavigationFailure.redirectError('redirect-cycle', '/a', null, 'push');

    applyNavigationOutcome(
      failure.toResult(),
      { ...identity('/a'), historyCommitted: true },
      ctx(),
    );

    expect(provider.commit).not.toHaveBeenCalled();
    expect(provider.rollback).not.toHaveBeenCalled();
  });
});

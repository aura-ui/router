import { FailedNavigation, NavigationError, finalizeFailure } from '../../core/failure';
import { createTestRoute } from '../helpers/create-test-route';

describe('FailedNavigation', () => {
  const to = {
    href: '/x',
    pathname: '/x',
    search: '',
    hash: '',
    pattern: '/x',
    route: createTestRoute('/x'),
  };

  it('viewCommitted derives from commit snapshot', () => {
    const error = new NavigationError({
      code: 'RENDER_FAILED',
      phase: 'render',
      routePattern: '/x',
      message: 'fail',
    });

    const committed = FailedNavigation.fromPipeline(
      error,
      { view: 'committed', href: '/x' },
      null,
      to,
      'push',
    );
    expect(committed.viewCommitted).toBe(true);

    const staged = FailedNavigation.fromPipeline(
      error,
      { view: 'staged', href: '/x' },
      null,
      to,
      'push',
    );
    expect(staged.viewCommitted).toBe(false);
  });

  it('finalizeFailure routes NOT_FOUND to onNotFound and clears prev', () => {
    const onNotFound = jest.fn();
    const onNavigationError = jest.fn();
    const notFoundHandler = jest.fn();

    const outcome = finalizeFailure(FailedNavigation.notFound('/missing', null, 'push'), {
      onNotFound,
      onNavigationError,
      notFoundHandler,
    });

    expect(onNotFound).toHaveBeenCalledWith(
      expect.objectContaining({
        href: '/missing',
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      }),
    );
    expect(onNavigationError).not.toHaveBeenCalled();
    expect(notFoundHandler).toHaveBeenCalledWith('/missing');
    expect(outcome).toEqual({ setPrev: null });
  });

  it('finalizeFailure routes pipeline error to onNavigationError', () => {
    const error = new NavigationError({
      code: 'RENDER_FAILED',
      phase: 'render',
      routePattern: '/x',
      message: 'fail',
    });
    const onNavigationError = jest.fn();

    const failed = FailedNavigation.fromPipeline(
      error,
      { view: 'committed', href: '/x' },
      null,
      to,
      'push',
    );

    const outcome = finalizeFailure(failed, {
      onNavigationError,
    });

    expect(onNavigationError).toHaveBeenCalledWith(failed);
    expect(outcome).toEqual({ setPrev: to });
  });

  it('finalizeFailure leaves prev unchanged when view not committed', () => {
    const error = new NavigationError({
      code: 'GUARD_THROW',
      phase: 'guard',
      routePattern: '/x',
      message: 'blocked',
    });

    const outcome = finalizeFailure(
      FailedNavigation.fromPipeline(
        error,
        { view: 'none', href: '/x' },
        null,
        to,
        'push',
      ),
      {},
    );

    expect(outcome).toEqual({});
  });
});


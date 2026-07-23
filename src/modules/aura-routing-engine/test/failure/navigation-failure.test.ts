import { NavigationFailure, NavigationError } from '../../core/failure';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';

describe('NavigationFailure', () => {
  const to = createMatchedRoute('/x');

  it('viewCommitted derives from commit snapshot', () => {
    const error = new NavigationError({
      code: 'RENDER_FAILED',
      phase: 'render',
      routePattern: '/x',
      message: 'fail',
    });

    const committed = NavigationFailure.fromPipeline(
      error,
      { view: 'committed', href: '/x' },
      null,
      to,
      'push',
    );
    expect(committed.viewCommitted).toBe(true);

    const staged = NavigationFailure.fromPipeline(
      error,
      { view: 'staged', href: '/x' },
      null,
      to,
      'push',
    );
    expect(staged.viewCommitted).toBe(false);
  });
});

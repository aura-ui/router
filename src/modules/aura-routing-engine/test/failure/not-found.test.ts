import { NavigationFailure } from '../../core/failure';

describe('not-found failure', () => {
  it('creates structured NOT_FOUND error', () => {
    const failure = NavigationFailure.notFound('/missing', null, 'push');
    expect(failure.error.code).toBe('NOT_FOUND');
    expect(failure.error.phase).toBe('match');
    expect(failure.error.message).toContain('/missing');
    expect(failure.isNotFound).toBe(true);
  });

  it('creates transaction result with none view commit', () => {
    const result = NavigationFailure.notFound('/gone', null, 'push').toResult();
    expect(result).toMatchObject({
      status: 'error',
      failure: {
        error: expect.objectContaining({ code: 'NOT_FOUND', phase: 'match' }),
        commit: { view: 'none', href: '/gone' },
        to: null,
      },
    });
  });
});

import {
  NavigationError,
  createContentLoadError,
  defaultCodeForPhase,
  isNavigationError,
  normalizeFailure,
} from '../../core/failure';

describe('NavigationError', () => {
  it('preserves cause chain', () => {
    const cause = new Error('network');
    const error = new NavigationError({
      code: 'CONTENT_LOAD_FAILED',
      phase: 'render',
      routePattern: '/page',
      message: 'load failed',
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(isNavigationError(error)).toBe(true);
  });

  it('createContentLoadError wraps loader failures', () => {
    const error = createContentLoadError('url', '/users', new Error('404'));
    expect(error.code).toBe('CONTENT_LOAD_FAILED');
    expect(error.phase).toBe('render');
    expect(error.message).toContain('url');
    expect(error.message).toContain('/users');
  });

  it('normalizeFailure returns existing NavigationError', () => {
    const original = createContentLoadError('html', '/a', new Error('x'));
    expect(
      normalizeFailure(original, { phase: 'render', routePattern: '/a' }),
    ).toBe(original);
  });

  it('normalizeFailure wraps unknown errors', () => {
    const normalized = normalizeFailure(new Error('boom'), {
      phase: 'guard',
      routePattern: '/login',
    });

    expect(normalized).toBeInstanceOf(NavigationError);
    expect(normalized.code).toBe('GUARD_THROW');
    expect(normalized.phase).toBe('guard');
  });

  it('defaultCodeForPhase maps phases via FAILURE_CODE_BY_PHASE', () => {
    expect(defaultCodeForPhase('match')).toBe('NOT_FOUND');
    expect(defaultCodeForPhase('load')).toBe('LOAD_FAILED');
    expect(defaultCodeForPhase('ready')).toBe('HOOK_THROW');
  });
});

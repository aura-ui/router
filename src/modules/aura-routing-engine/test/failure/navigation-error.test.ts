import {
  NavigationError,
  createViewLoadError,
  defaultCodeForPhase,
  isNavigationError,
  normalizeNavigationError,
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

  it('createViewLoadError wraps loader failures', () => {
    const error = createViewLoadError('url', '/users', new Error('404'));
    expect(error.code).toBe('CONTENT_LOAD_FAILED');
    expect(error.phase).toBe('render');
    expect(error.message).toContain('url');
    expect(error.message).toContain('/users');
  });

  it('normalizeNavigationError returns existing NavigationError', () => {
    const original = createViewLoadError('html', '/a', new Error('x'));
    expect(
      normalizeNavigationError(original, { phase: 'render', routePattern: '/a' }),
    ).toBe(original);
  });

  it('normalizeNavigationError wraps unknown errors', () => {
    const normalized = normalizeNavigationError(new Error('boom'), {
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

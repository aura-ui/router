import { normalizeHookResult } from '../../core/hooks/registry';

describe('normalizeHookResult', () => {
  it('maps concise public values to GuardResult', () => {
    expect(normalizeHookResult(undefined)).toBeUndefined();
    expect(normalizeHookResult(true)).toBeUndefined();
    expect(normalizeHookResult(false)).toBe(false);
    expect(normalizeHookResult('/login')).toBe('/login');
    expect(normalizeHookResult({ url: '/login', replace: true })).toEqual({
      url: '/login',
      replace: true,
    });
  });

  it('maps explicit HookResult shapes', () => {
    expect(normalizeHookResult({ type: 'cancel' })).toEqual({
      cancelled: true,
    });
    expect(
      normalizeHookResult({ type: 'cancel', reason: 'unsaved-changes' })
    ).toEqual({
      cancelled: true,
      reason: 'unsaved-changes',
    });
    expect(normalizeHookResult({ type: 'redirect', url: '/home' })).toEqual({
      url: '/home',
    });
    expect(
      normalizeHookResult({ type: 'redirect', url: '/home', replace: true })
    ).toEqual({
      url: '/home',
      replace: true,
    });
  });
});

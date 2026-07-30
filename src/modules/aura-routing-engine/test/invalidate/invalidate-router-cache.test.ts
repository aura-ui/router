import { AuraResolvableSwrCache } from '../../../aura-cache/core/aura-resolvable-swr-cache';
import { invalidateRouterCache } from '../../core/invalidate-router-cache';

describe('invalidateRouterCache', () => {
  let cache: AuraResolvableSwrCache<string> | undefined;

  afterEach(() => {
    cache?.destroy();
    cache = undefined;
  });

  it('returns -1 when a full invalidate matches no entries', () => {
    cache = new AuraResolvableSwrCache({ gcSweepInterval: false });
    expect(invalidateRouterCache(cache, {})).toBe(-1);
  });

  it('invalidates an exact key', () => {
    cache = new AuraResolvableSwrCache({ gcSweepInterval: false });
    cache.set('data:/users', 'a');
    cache.set('data:/users|id=1', 'b');
    cache.set('data:/users/other', 'c');

    const count = invalidateRouterCache(cache, { key: 'data:/users', policy: 'remove' });

    expect(count).toBe(1);
    expect(cache.get('data:/users')).toBeUndefined();
    expect(cache.get('data:/users|id=1')).toBe('b');
    expect(cache.get('data:/users/other')).toBe('c');
  });

  it('invalidates by path prefix for data keys', () => {
    cache = new AuraResolvableSwrCache({ gcSweepInterval: false });
    cache.set('data:/items', 'a');
    cache.set('data:/profile', 'b');

    const count = invalidateRouterCache(cache, { path: '/items', policy: 'remove' });

    expect(count).toBe(1);
    expect(cache.get('data:/items')).toBeUndefined();
    expect(cache.get('data:/profile')).toBe('b');
  });

  it('invalidates by path prefix for view keys', () => {
    cache = new AuraResolvableSwrCache({ gcSweepInterval: false });
    cache.set('view:/users|layout:template:x', 'a');
    cache.set('view:/profile|view:html:y', 'b');

    const count = invalidateRouterCache(cache, { path: '/users', policy: 'remove' });

    expect(count).toBe(1);
    expect(cache.get('view:/users|layout:template:x')).toBeUndefined();
    expect(cache.get('view:/profile|view:html:y')).toBe('b');
  });

  it('matches path prefix before params/query/slot segments', () => {
    cache = new AuraResolvableSwrCache({ gcSweepInterval: false });
    cache.set('data:/users', 'root');
    cache.set('data:/users|id=1', 'param');
    cache.set('view:/users|view:html:<p/>', 'view');
    cache.set('data:/users-extra', 'other');

    const count = invalidateRouterCache(cache, { path: '/users', policy: 'remove' });

    expect(count).toBe(3);
    expect(cache.get('data:/users')).toBeUndefined();
    expect(cache.get('data:/users|id=1')).toBeUndefined();
    expect(cache.get('view:/users|view:html:<p/>')).toBeUndefined();
    expect(cache.get('data:/users-extra')).toBe('other');
  });
});

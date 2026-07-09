import { AuraResolvableCache } from '../../../aura-cache-store/core/aura-resolvable-cache';
import { invalidateRouterCache } from '../../core/invalidate-router-cache';

describe('invalidateRouterCache', () => {
  let cache: AuraResolvableCache<string> | undefined;

  afterEach(() => {
    cache?.destroy();
    cache = undefined;
  });

  it('returns -1 when a full invalidate matches no entries', () => {
    cache = new AuraResolvableCache({ gcSweepInterval: false });
    expect(invalidateRouterCache(cache, {})).toBe(-1);
  });

  it('invalidates an exact key', () => {
    cache = new AuraResolvableCache({ gcSweepInterval: false });
    cache.set('/users|fetch', 'a');
    cache.set('/users|fetch|a=1', 'b');
    cache.set('/users|other', 'c');

    const count = invalidateRouterCache(cache, { key: '/users|fetch', policy: 'remove' });

    expect(count).toBe(1);
    expect(cache.get('/users|fetch')).toBeUndefined();
    expect(cache.get('/users|fetch|a=1')).toBe('b');
    expect(cache.get('/users|other')).toBe('c');
  });

  it('invalidates by path prefix', () => {
    cache = new AuraResolvableCache({ gcSweepInterval: false });
    cache.set('/items|fetch', 'a');
    cache.set('/profile|fetch', 'b');

    const count = invalidateRouterCache(cache, { path: '/items', policy: 'remove' });

    expect(count).toBe(1);
    expect(cache.get('/items|fetch')).toBeUndefined();
    expect(cache.get('/profile|fetch')).toBe('b');
  });

  it('matches path prefix before hook suffix', () => {
    cache = new AuraResolvableCache({ gcSweepInterval: false });
    cache.set('/users', 'root');
    cache.set('/users|fetch-user', 'hook');
    cache.set('/users|fetch-user|id=1', 'param');
    cache.set('/users-extra|fetch', 'other');

    const count = invalidateRouterCache(cache, { path: '/users', policy: 'remove' });

    expect(count).toBe(3);
    expect(cache.get('/users')).toBeUndefined();
    expect(cache.get('/users|fetch-user')).toBeUndefined();
    expect(cache.get('/users|fetch-user|id=1')).toBeUndefined();
    expect(cache.get('/users-extra|fetch')).toBe('other');
  });
});

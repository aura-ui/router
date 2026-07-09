import { NO_CACHE, parseCacheAttr } from '../../core/content';

describe('parseCacheAttr (content barrel)', () => {
  it('re-exports cache parser from aura-route', () => {
    expect(parseCacheAttr('data')).toEqual({ dom: false, view: false, data: true });
    expect(parseCacheAttr(null)).toEqual(NO_CACHE);
  });
});

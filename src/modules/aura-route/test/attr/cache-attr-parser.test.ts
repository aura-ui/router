import { NO_CACHE, parseCacheAttr } from '../../core/attr/cache-attr-parser';

describe('parseCacheAttr', () => {
  it('maps cache modes to dom/view/data flags', () => {
    expect(parseCacheAttr(null)).toEqual(NO_CACHE);
    expect(parseCacheAttr('')).toEqual(NO_CACHE);
    expect(parseCacheAttr('dom')).toEqual({ dom: true, view: false, data: false });
    expect(parseCacheAttr('view')).toEqual({ dom: false, view: true, data: false });
    expect(parseCacheAttr('data')).toEqual({ dom: false, view: false, data: true });
    expect(parseCacheAttr('screen')).toEqual({ dom: true, view: true, data: false });
    expect(parseCacheAttr('all')).toEqual({ dom: true, view: true, data: true });
    expect(parseCacheAttr('off')).toEqual(NO_CACHE);
    expect(parseCacheAttr('none')).toEqual(NO_CACHE);
    expect(parseCacheAttr('false')).toEqual(NO_CACHE);
    expect(parseCacheAttr('unknown')).toEqual(NO_CACHE);
  });
});

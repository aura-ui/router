import {
  ALL_CACHE,
  DEFAULT_CACHE,
  DOM_CACHE,
  NO_CACHE,
  parseCacheAttr,
} from '../../core/attr/cache-attr-parser';

describe('parseCacheAttr', () => {
  it('maps cache modes to dom/view/data flags', () => {
    expect(parseCacheAttr(null)).toEqual(NO_CACHE);
    expect(parseCacheAttr('')).toEqual(DEFAULT_CACHE);
    expect(parseCacheAttr('   ')).toEqual(DEFAULT_CACHE);
    expect(parseCacheAttr('dom')).toEqual(DOM_CACHE);
    expect(parseCacheAttr('view')).toEqual({ dom: false, view: true, data: false });
    expect(parseCacheAttr('data')).toEqual({ dom: false, view: false, data: true });
    expect(parseCacheAttr('all')).toEqual(ALL_CACHE);
    expect(parseCacheAttr('off')).toEqual(NO_CACHE);
    expect(parseCacheAttr('none')).toEqual(NO_CACHE);
    expect(parseCacheAttr('false')).toEqual(NO_CACHE);
  });

  it('warns and returns NO_CACHE for unknown tokens', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseCacheAttr('unknown')).toEqual(NO_CACHE);
    expect(warn).toHaveBeenCalledWith(
      'Invalid cache attribute value "unknown"; expected dom, view, data, all, or none/off/false',
    );
    warn.mockRestore();
  });
});

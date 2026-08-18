import { parsePathAttr } from '../../core/attr/path-attr-parser';

describe('parsePathAttr', () => {
  it('trims; warns once on ? or #; leaves value unchanged', () => {
    expect(parsePathAttr(null)).toBeNull();
    expect(parsePathAttr('  /users/:id  ')).toBe('/users/:id');

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const withQuery = `/path-warn-q-${Date.now()}.html?id=:id`;
    const withHash = `/path-warn-h-${Date.now()}.html#top`;

    expect(parsePathAttr(withQuery)).toBe(withQuery);
    expect(parsePathAttr(withHash)).toBe(withHash);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pathname only'));

    warn.mockClear();
    parsePathAttr(withQuery);
    parsePathAttr(withHash);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
